"""
GeminiProxyProvider - 通过第三方中转站调用 Gemini 图片生成能力。
支持两种模式：
  - native: 与 Gemini 原生 API 格式一致，发往中转站 base_url
  - openai_compat: OpenAI Chat Completion 兼容接口，返回 base64 图片
"""

import base64
import io
import uuid

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.config import settings
from app.core.exceptions import AppError
from app.schemas_media import MediaRequest, MediaResponse
from app.storage.minio_client import get_minio_client


class GeminiProxyProvider(MediaProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str,
        mode: str = "native",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.mode = mode  # "native" | "openai_compat"
        self.minio = get_minio_client()
        self.bucket_name = settings.MINIO_BUCKET_VFS

    # ------------------------------------------------------------------
    # public entry
    # ------------------------------------------------------------------
    async def generate(self, request: MediaRequest) -> MediaResponse:
        if self.mode == "openai_compat":
            return await self._generate_openai_compat(request)
        return await self._generate_native(request)

    # ------------------------------------------------------------------
    # native 风格 (与 Gemini 原生 API 格式一致)
    # ------------------------------------------------------------------
    async def _generate_native(self, request: MediaRequest) -> MediaResponse:
        url = (
            f"{self.base_url}/models/{request.model_key}:generateContent"
            f"?key={self.api_key}"
        )
        payload: dict = {
            "contents": [{"parts": [{"text": request.prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }
        if request.param_json:
            payload["generationConfig"].update(request.param_json)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=120.0,
            )
            if resp.status_code != 200:
                raise AppError(
                    msg=f"Gemini Proxy (native) error: {resp.status_code}",
                    data={"raw": resp.text},
                    code=502,
                    status_code=502,
                )
            data = resp.json()

        # 从 candidates 中提取 base64 图片
        image_data, mime_type = self._extract_image_from_native(data)
        image_url = self._upload_base64_to_minio(image_data, mime_type)

        return MediaResponse(
            url=image_url,
            usage_id=str(uuid.uuid4()),
            meta=data,
        )

    # ------------------------------------------------------------------
    # OpenAI Chat Completion 兼容接口
    # ------------------------------------------------------------------
    async def _generate_openai_compat(self, request: MediaRequest) -> MediaResponse:
        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload: dict = {
            "model": request.model_key,
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": request.prompt}],
                }
            ],
            "max_tokens": 4096,
        }
        if request.param_json:
            payload.update(request.param_json)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url, json=payload, headers=headers, timeout=120.0
            )
            if resp.status_code != 200:
                raise AppError(
                    msg=f"Gemini Proxy (openai_compat) error: {resp.status_code}",
                    data={"raw": resp.text},
                    code=502,
                    status_code=502,
                )
            data = resp.json()

        # 从 choices 中提取 base64 图片
        image_data, mime_type = self._extract_image_from_openai(data)
        image_url = self._upload_base64_to_minio(image_data, mime_type)

        return MediaResponse(
            url=image_url,
            usage_id=data.get("id", str(uuid.uuid4())),
            meta=data,
        )

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_image_from_native(data: dict) -> tuple[str, str]:
        """从 Gemini 原生格式响应中提取 base64 图片数据。"""
        candidates = data.get("candidates", [])
        if not candidates:
            raise AppError(msg="Gemini Proxy: no candidates in response", data=data, code=502, status_code=502)

        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                return inline["data"], mime

        raise AppError(msg="Gemini Proxy: no image data in response", data=data, code=502, status_code=502)

    @staticmethod
    def _extract_image_from_openai(data: dict) -> tuple[str, str]:
        """从 OpenAI 兼容格式响应中提取 base64 图片数据。"""
        choices = data.get("choices", [])
        if not choices:
            raise AppError(msg="Gemini Proxy: no choices in response", data=data, code=502, status_code=502)

        message = choices[0].get("message", {})
        content = message.get("content")

        # content 可能是 list[{type, ...}] 或纯字符串
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "image_url":
                    url_field = block.get("image_url", {}).get("url", "")
                    if url_field.startswith("data:"):
                        # data:image/png;base64,xxxxx
                        header, b64 = url_field.split(",", 1)
                        mime = header.split(";")[0].replace("data:", "")
                        return b64, mime
                    return url_field, "image/png"
                if block.get("type") == "image" and block.get("data"):
                    return block["data"], block.get("mime_type", "image/png")

        raise AppError(msg="Gemini Proxy: no image in openai_compat response", data=data, code=502, status_code=502)

    def _upload_base64_to_minio(self, b64_data: str, mime_type: str) -> str:
        """解码 base64 图片并上传至 MinIO，返回可访问 URL。"""
        try:
            image_bytes = base64.b64decode(b64_data)
        except Exception as e:
            raise AppError(msg=f"Failed to decode base64 image: {e}", code=500, status_code=500)

        ext = mime_type.split("/")[-1] if mime_type else "png"
        object_name = f"generated/gemini_proxy/{uuid.uuid4()}.{ext}"

        try:
            self.minio.put_object(
                self.bucket_name,
                object_name,
                io.BytesIO(image_bytes),
                len(image_bytes),
                content_type=mime_type,
            )
        except Exception as e:
            raise AppError(msg=f"Failed to upload image to MinIO: {e}", code=500, status_code=500)

        scheme = "https" if settings.MINIO_SECURE else "http"
        return f"{scheme}://{settings.MINIO_ENDPOINT}/{self.bucket_name}/{object_name}"
