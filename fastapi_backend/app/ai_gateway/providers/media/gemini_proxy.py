"""
GeminiProxyProvider - 通过第三方中转站调用 Gemini 图片生成能力。
支持两种模式：
  - native: 与 Gemini 原生 API 格式一致，发往中转站 base_url
  - openai_compat: OpenAI Chat Completion 兼容接口，返回 base64 图片
"""

import base64
import io
import logging
import uuid

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.config import settings

logger = logging.getLogger(__name__)
from app.core.exceptions import AppError
from app.schemas_media import MediaRequest, MediaResponse
from app.storage.minio_client import get_minio_client


class GeminiProxyProvider(MediaProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str,
        mode: str = "openai_compat",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.mode = mode  # "native" | "openai_compat"
        self.minio = get_minio_client()
        self.bucket_name = settings.MINIO_BUCKET_VFS

    # ------------------------------------------------------------------
    # public entry
    # ------------------------------------------------------------------
    MAX_RETRIES = 2  # 最多重试 2 次（共 3 次尝试）

    async def generate(self, request: MediaRequest) -> MediaResponse:
        # 允许通过 param_json 或 model_capabilities 中的 api_mode 覆盖默认 mode
        mode = self.mode
        if request.param_json:
            mode_override = request.param_json.pop("api_mode", None)
            if mode_override in ("native", "openai_compat"):
                mode = mode_override

        logger.info("[gemini_proxy] generate called: base_url=%s, mode=%s, model=%s",
                     self.base_url, mode, request.model_key)

        if mode == "openai_compat":
            return await self._with_retry(self._generate_openai_compat, request)
        try:
            return await self._with_retry(self._generate_native, request)
        except AppError as e:
            # 如果 native 模式失败且看起来像是协议不匹配，自动 fallback 到 openai_compat
            if "empty response" in str(e.msg).lower() or "404" in str(e.msg):
                logger.warning("[gemini_proxy] native mode failed (%s), falling back to openai_compat", e.msg)
                return await self._with_retry(self._generate_openai_compat, request)
            raise
        except httpx.TimeoutException as e:
            logger.warning("[gemini_proxy] native mode timed out (%s), falling back to openai_compat", e)
            return await self._with_retry(self._generate_openai_compat, request)

    async def _with_retry(self, fn, request: MediaRequest) -> MediaResponse:
        """对瞬时网络错误（连接断开、超时等）自动重试。"""
        import asyncio
        last_exc: Exception | None = None
        for attempt in range(1, self.MAX_RETRIES + 2):  # 1..MAX_RETRIES+1
            try:
                return await fn(request)
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError, httpx.ReadTimeout) as e:
                last_exc = e
                logger.warning("[gemini_proxy] attempt %d/%d failed with %s: %s, retrying...",
                               attempt, self.MAX_RETRIES + 1, type(e).__name__, e)
                if attempt <= self.MAX_RETRIES:
                    await asyncio.sleep(2 * attempt)  # 2s, 4s backoff
                continue
        # 所有重试都失败
        raise AppError(
            msg=f"Gemini Proxy: all {self.MAX_RETRIES + 1} attempts failed: {last_exc}",
            code=502, status_code=502,
        )

    # ------------------------------------------------------------------
    # native 风格 (与 Gemini 原生 API 格式一致)
    # ------------------------------------------------------------------
    async def _generate_native(self, request: MediaRequest) -> MediaResponse:
        # 避免 base_url 已包含 /v1beta 时重复拼接
        base = self.base_url
        if base.endswith("/v1beta"):
            base = base[: -len("/v1beta")]
        url = (
            f"{base}/v1beta/models/{request.model_key}:generateContent"
            f"?key={self.api_key}"
        )
        logger.info("[gemini_proxy] native mode, base_url=%s, model=%s, full_url=%s",
                     self.base_url, request.model_key, url.replace(self.api_key, "***"))
        payload: dict = {
            "contents": [{"parts": [{"text": request.prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }

        # 将参考图作为 inlineData parts 注入 contents（Gemini 原生格式）
        image_data_urls = (request.param_json or {}).get("image_data_urls") or []
        if image_data_urls:
            import re as _re
            parts = payload["contents"][0]["parts"]
            for img_url in image_data_urls:
                if not isinstance(img_url, str) or not img_url.strip():
                    continue
                m = _re.match(r"data:([^;]+);base64,(.+)", img_url, _re.DOTALL)
                if m:
                    parts.insert(0, {"inlineData": {"mimeType": m.group(1), "data": m.group(2)}})

        if request.param_json:
            # 移除前端专用字段
            clean = {k: v for k, v in request.param_json.items() if k not in (
                "resolution", "resolution_tier", "model_config_id", "session_id",
                "image_data_urls", "input_file_node_ids",
            )}
            if clean:
                payload["generationConfig"].update(clean)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=httpx.Timeout(90.0, connect=15.0),
            )
            if resp.status_code != 200:
                raise AppError(
                    msg=f"Gemini Proxy (native) error: {resp.status_code}",
                    data={"raw": resp.text[:2000] if resp.text else "(empty)"},
                    code=502,
                    status_code=502,
                )
            body = resp.text
            if not body or not body.strip():
                raise AppError(
                    msg="Gemini Proxy (native): empty response body",
                    data={"status": resp.status_code, "headers": dict(resp.headers)},
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
        # 避免 base_url 已包含 /v1 时重复拼接
        base = self.base_url
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        url = f"{base}/v1/chat/completions"
        logger.info("[gemini_proxy] openai_compat mode, base_url=%s, model=%s, full_url=%s",
                     self.base_url, request.model_key, url)
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

        # 将参考图作为 image_url content block 注入 messages
        image_data_urls = (request.param_json or {}).get("image_data_urls") or []
        if image_data_urls:
            content_parts = payload["messages"][0]["content"]
            for img_url in image_data_urls:
                if isinstance(img_url, str) and img_url.strip():
                    content_parts.insert(0, {
                        "type": "image_url",
                        "image_url": {"url": img_url.strip()},
                    })

        if request.param_json:
            # 移除前端专用字段，只保留 OpenAI 兼容参数
            _FRONTEND_ONLY = {
                "resolution", "resolution_tier", "model_config_id", "session_id",
                "image_data_urls", "input_file_node_ids", "api_mode",
                "negative_prompt", "filename", "parent_node_id", "project_id",
            }
            clean = {k: v for k, v in request.param_json.items() if k not in _FRONTEND_ONLY}
            if clean:
                payload.update(clean)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url, json=payload, headers=headers, timeout=httpx.Timeout(90.0, connect=15.0)
            )
            if resp.status_code != 200:
                raise AppError(
                    msg=f"Gemini Proxy (openai_compat) error: {resp.status_code}",
                    data={"raw": resp.text},
                    code=502,
                    status_code=502,
                )
            data = resp.json()

        logger.info("[gemini_proxy] openai_compat raw response keys=%s, choices_count=%d",
                     list(data.keys()), len(data.get("choices", [])))
        # 打印第一个 choice 的 message 结构（截断避免日志过大）
        choices = data.get("choices", [])
        if choices:
            msg = choices[0].get("message", {})
            content = msg.get("content")
            if isinstance(content, str):
                logger.info("[gemini_proxy] choice[0].message.content is str, len=%d, preview=%s",
                             len(content), content[:500])
            elif isinstance(content, list):
                logger.info("[gemini_proxy] choice[0].message.content is list, len=%d, types=%s",
                             len(content), [b.get("type") for b in content if isinstance(b, dict)])
            else:
                logger.info("[gemini_proxy] choice[0].message.content type=%s", type(content).__name__)

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
        """从 OpenAI 兼容格式响应中提取 base64 图片数据。
        支持多种中转站返回格式：
          - content 为 list，含 image_url / image 类型 block
          - content 为 str，含 data:image/...;base64,... 内联图片
          - content 为 str，含 markdown 图片 ![...](data:image/...;base64,...)
          - content 为 str，本身就是纯 base64 数据
        """
        import re

        choices = data.get("choices", [])
        if not choices:
            raise AppError(msg="Gemini Proxy: no choices in response", data=data, code=502, status_code=502)

        message = choices[0].get("message", {})
        content = message.get("content")

        # --- content 是 list[{type, ...}] ---
        if isinstance(content, list):
            for block in content:
                btype = block.get("type", "")
                # image_url block
                if btype == "image_url":
                    url_field = block.get("image_url", {}).get("url", "")
                    if url_field.startswith("data:"):
                        header, b64 = url_field.split(",", 1)
                        mime = header.split(";")[0].replace("data:", "")
                        return b64, mime
                    return url_field, "image/png"
                # image block (some proxies)
                if btype == "image" and block.get("data"):
                    return block["data"], block.get("mime_type", "image/png")
                # text block 里可能嵌入了 data URL
                if btype == "text":
                    text_val = block.get("text", "")
                    m = re.search(r"data:(image/[^;]+);base64,([A-Za-z0-9+/=\s]+)", text_val)
                    if m:
                        return m.group(2).replace("\n", "").replace(" ", ""), m.group(1)

        # --- content 是纯字符串 ---
        if isinstance(content, str) and content.strip():
            # 尝试提取 data URL
            m = re.search(r"data:(image/[^;]+);base64,([A-Za-z0-9+/=\s]+)", content)
            if m:
                return m.group(2).replace("\n", "").replace(" ", ""), m.group(1)
            # 可能本身就是纯 base64（长度 > 100 且只含 base64 字符）
            stripped = content.strip()
            if len(stripped) > 100 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", stripped):
                return stripped.replace("\n", "").replace(" ", ""), "image/png"

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

        from app.storage.minio_client import build_minio_url
        return build_minio_url(self.bucket_name, object_name)
