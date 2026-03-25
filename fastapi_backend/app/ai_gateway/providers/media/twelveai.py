from __future__ import annotations

import asyncio
import base64
from typing import Any

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.core.exceptions import AppError
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse


class TwelveAIMediaProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://cdn.12ai.org", **kwargs: object) -> None:
        _ = kwargs
        self.api_key = api_key
        # Ensure no trailing slash and no /v1 suffix to avoid double paths
        self.base_url = (base_url or "https://cdn.12ai.org").rstrip("/").removesuffix("/v1")

    @property
    def supports_async(self) -> bool:
        return True

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _infer_kind(self, model_key: str, param_json: dict[str, Any]) -> str:
        kind = str(param_json.get("twelveai_kind") or "").strip().lower()
        if kind in {"image", "video"}:
            return kind
        model = (model_key or "").strip().lower()
        if "veo" in model or "sora" in model:
            return "video"
        return "image"

    async def generate(self, request: MediaRequest) -> MediaResponse:
        kind = self._infer_kind(request.model_key, request.param_json)
        
        if kind == "image":
            # Use sync generation for images (recommended by 12ai)
            return await self._generate_image_sync(request)
        
        # Use async flow for videos
        ref = await self.submit_async(request)
        for _ in range(120):
            status = await self.query_status(ref)
            if status.state == "succeeded" and status.result is not None:
                return status.result
            if status.state == "failed":
                raise AppError(msg=status.error or "12ai generation failed", code=502, status_code=502)
            await asyncio.sleep(2)
        raise AppError(msg="12ai task timeout", code=504, status_code=504)

    async def _generate_image_sync(self, request: MediaRequest) -> MediaResponse:
        """Generate image using sync Gemini API endpoint."""
        # Build Gemini-style request body
        payload: dict[str, Any] = {
            "contents": [{
                "parts": [{"text": request.prompt}]
            }],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
            }
        }
        
        # Map param_json to generationConfig.imageConfig
        image_config: dict[str, Any] = {}
        if request.param_json:
            if "aspect_ratio" in request.param_json:
                image_config["aspectRatio"] = request.param_json["aspect_ratio"]
            if "imageSize" in request.param_json:
                image_config["imageSize"] = request.param_json["imageSize"]
            if "image_size" in request.param_json:
                image_config["imageSize"] = request.param_json["image_size"]
        
        if image_config:
            payload["generationConfig"]["imageConfig"] = image_config
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            url = f"{self.base_url}/v1beta/models/{request.model_key}:generateContent"
            resp = await client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()
        
        # Extract base64 image from response
        image_b64 = self._extract_image_base64(data)
        if not image_b64:
            raise AppError(msg="12ai image generation failed: no image data in response", code=502, status_code=502)
        
        # Create data URL from base64
        mime_type = self._extract_image_mime_type(data) or "image/png"
        data_url = f"data:{mime_type};base64,{image_b64}"
        
        # Generate a unique usage_id for tracking
        import uuid
        return MediaResponse(
            url=data_url,
            duration=None,
            cost=None,
            usage_id=str(uuid.uuid4()),
            meta=data
        )

    def _extract_image_base64(self, data: dict[str, Any]) -> str | None:
        """Extract base64 image data from Gemini response."""
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        
        for part in parts:
            if isinstance(part, dict) and "inlineData" in part:
                inline_data = part["inlineData"]
                if isinstance(inline_data, dict):
                    image_data = inline_data.get("data")
                    if isinstance(image_data, str) and image_data.strip():
                        return image_data.strip()
        
        return None

    def _extract_image_mime_type(self, data: dict[str, Any]) -> str | None:
        """Extract MIME type from Gemini response."""
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        
        for part in parts:
            if isinstance(part, dict) and "inlineData" in part:
                inline_data = part["inlineData"]
                if isinstance(inline_data, dict):
                    mime_type = inline_data.get("mimeType")
                    if isinstance(mime_type, str) and mime_type.strip():
                        return mime_type.strip()
        
        return None

    async def submit_async(self, request: MediaRequest) -> ExternalTaskRef:
        kind = self._infer_kind(request.model_key, request.param_json)
        async with httpx.AsyncClient(timeout=60.0) as client:
            if kind == "video":
                payload = {
                    "model": request.model_key,
                    "prompt": request.prompt,
                    **request.param_json,
                }
                resp = await client.post(f"{self.base_url}/v1/videos", headers=self._headers(), json=payload)
                resp.raise_for_status()
                data = resp.json()
                task_id = str(data.get("id") or data.get("task_id") or "").strip()
                if not task_id:
                    raise AppError(msg="12ai video task id missing", code=502, status_code=502)
                return ExternalTaskRef(
                    external_task_id=task_id,
                    provider="twelveai_media",
                    meta={"kind": "video", "base_url": self.base_url, "api_key": self.api_key, "model": request.model_key},
                )

            # For async image (fallback, not used by default)
            payload = {
                "prompt": request.prompt,
                "model": request.model_key,
                **request.param_json,
            }
            resp = await client.post(f"{self.base_url}/v1/images/async/generations", headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()
            task_id = str(data.get("id") or data.get("task_id") or "").strip()
            if not task_id:
                raise AppError(msg="12ai image task id missing", code=502, status_code=502)
            return ExternalTaskRef(
                external_task_id=task_id,
                provider="twelveai_media",
                meta={"kind": "image", "base_url": self.base_url, "api_key": self.api_key, "model": request.model_key},
            )

    async def query_status(self, ref: ExternalTaskRef) -> ExternalTaskStatus:
        kind = str(ref.meta.get("kind") or "image").lower()
        base_url = str(ref.meta.get("base_url") or self.base_url).rstrip("/")
        async with httpx.AsyncClient(timeout=60.0) as client:
            if kind == "video":
                resp = await client.get(f"{base_url}/v1/videos/{ref.external_task_id}", headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                state = self._map_state(str(data.get("status") or data.get("state") or "pending"))
                if state == "succeeded":
                    url = f"{base_url}/v1/videos/{ref.external_task_id}/content"
                    return ExternalTaskStatus(
                        state="succeeded",
                        progress=100,
                        result=MediaResponse(url=url, duration=None, cost=None, usage_id=ref.external_task_id, meta=data),
                        error=None,
                    )
                if state == "failed":
                    return ExternalTaskStatus(state="failed", progress=None, result=None, error=str(data.get("error") or data.get("message") or "12ai video failed"))
                return ExternalTaskStatus(state=state, progress=self._extract_progress(data), result=None, error=None)

            resp = await client.get(f"{base_url}/v1/images/async/generations/{ref.external_task_id}", headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            state = self._map_state(str(data.get("status") or data.get("state") or "pending"))
            if state == "succeeded":
                url = self._extract_image_url(data)
                if not url:
                    return ExternalTaskStatus(state="failed", progress=None, result=None, error="12ai image result url missing")
                return ExternalTaskStatus(
                    state="succeeded",
                    progress=100,
                    result=MediaResponse(url=url, duration=None, cost=None, usage_id=ref.external_task_id, meta=data),
                    error=None,
                )
            if state == "failed":
                return ExternalTaskStatus(state="failed", progress=None, result=None, error=str(data.get("error") or data.get("message") or "12ai image failed"))
            return ExternalTaskStatus(state=state, progress=self._extract_progress(data), result=None, error=None)

    def _map_state(self, raw: str) -> str:
        value = (raw or "").strip().lower()
        if value in {"completed", "succeeded", "success", "done"}:
            return "succeeded"
        if value in {"failed", "error", "cancelled", "canceled"}:
            return "failed"
        if value in {"running", "processing", "in_progress"}:
            return "running"
        return "pending"

    def _extract_progress(self, data: dict[str, Any]) -> int | None:
        value = data.get("progress")
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        return None

    def _extract_image_url(self, data: dict[str, Any]) -> str | None:
        for key in ("url", "image_url", "output_url"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        nested = data.get("data")
        if isinstance(nested, list):
            for item in nested:
                if isinstance(item, dict):
                    for key in ("url", "image_url", "output_url"):
                        value = item.get(key)
                        if isinstance(value, str) and value.strip():
                            return value.strip()
        return None
