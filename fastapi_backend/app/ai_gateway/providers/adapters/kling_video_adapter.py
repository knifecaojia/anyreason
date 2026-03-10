from __future__ import annotations

import re
from typing import Any

from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.kling_common import httpx_client, kling_bearer_token, kling_headers
from app.ai_gateway.providers.kling_video_provider import KlingVideoProvider, _strip_data_url_prefix
from app.ai_gateway.types import ResolvedModelConfig
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse


class KlingVideoAdapter(MediaProvider):
    """Adapter that bridges KlingVideoProvider to the unified MediaProvider interface."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self._provider = KlingVideoProvider()
        self._api_key = api_key
        self._base_url = base_url

    def _build_cfg(self, request: MediaRequest) -> ResolvedModelConfig:
        return ResolvedModelConfig(
            category="video",
            manufacturer="kling",
            model=request.model_key,
            api_key=self._api_key,
            base_url=self._base_url,
        )

    async def generate(self, request: MediaRequest) -> MediaResponse:
        cfg = self._build_cfg(request)
        url = await self._provider.generate_video(
            cfg=cfg,
            prompt=request.prompt,
            duration=request.param_json.get("duration", 5),
            aspect_ratio=request.param_json.get("aspect_ratio", "16:9"),
            image_data_urls=request.param_json.get("image_data_urls"),
        )
        return MediaResponse(url=url, usage_id="", meta={})

    # ------------------------------------------------------------------
    # Two-phase async interface
    # ------------------------------------------------------------------

    @property
    def supports_async(self) -> bool:
        return True

    async def submit_async(self, request: MediaRequest) -> ExternalTaskRef:
        cfg = self._build_cfg(request)
        duration = request.param_json.get("duration", 5)
        aspect_ratio = request.param_json.get("aspect_ratio", "16:9")
        image_data_urls = request.param_json.get("image_data_urls")

        token = kling_bearer_token(cfg.api_key)
        headers = kling_headers(token=token)

        default_base_url = (
            "https://api-beijing.klingai.com/v1/videos/image2video|"
            "https://api-beijing.klingai.com/v1/videos/text2video|"
            "https://api-beijing.klingai.com/v1/videos/text2video/{taskId}"
        )
        base_url = (cfg.base_url or default_base_url).strip()
        parts = [p.strip() for p in base_url.split("|") if p.strip()]
        if len(parts) != 3:
            raise RuntimeError("kling_base_url_invalid")
        image2video_url, text2video_url, query_url_tpl = parts

        images = [i for i in list(image_data_urls or []) if (i or "").strip()]
        has_image = len(images) > 0
        create_url = image2video_url if has_image else text2video_url

        model_name = cfg.model
        mode = "std"
        m = re.match(r"^(.+)\((STD|PRO)\)$", (cfg.model or "").strip(), flags=re.IGNORECASE)
        if m:
            model_name = m.group(1)
            mode = m.group(2).lower()

        body: dict[str, Any] = {
            "model_name": model_name,
            "mode": mode,
            "duration": str(int(duration)),
            "prompt": request.prompt,
            "aspect_ratio": aspect_ratio,
        }
        if has_image:
            body["image"] = _strip_data_url_prefix(images[0])
            if len(images) > 1:
                body["image_tail"] = _strip_data_url_prefix(images[1])

        async with httpx_client(timeout_seconds=60.0) as client:
            resp = await client.post(create_url, headers=headers, json=body)
            resp.raise_for_status()
            create_data = resp.json()

        if create_data.get("code") != 0:
            raise RuntimeError(create_data.get("message") or "kling_create_task_failed")

        task_id = (create_data.get("data") or {}).get("task_id")
        if not task_id:
            raise RuntimeError("kling_task_id_missing")

        return ExternalTaskRef(
            external_task_id=str(task_id),
            provider="kling_video",
            meta={
                "query_url_tpl": query_url_tpl,
                "api_key": cfg.api_key,
            },
        )

    async def query_status(self, ref: ExternalTaskRef) -> ExternalTaskStatus:
        query_url_tpl = ref.meta.get("query_url_tpl", "")
        api_key = ref.meta.get("api_key", "")
        query_url = query_url_tpl.replace("{taskId}", ref.external_task_id)

        token = kling_bearer_token(api_key)
        headers = kling_headers(token=token)

        async with httpx_client(timeout_seconds=60.0) as client:
            try:
                r = await client.get(query_url, headers=headers)
            except Exception as e:
                return ExternalTaskStatus(state="running")  # transient
            if r.status_code == 404:
                return ExternalTaskStatus(state="failed", error=f"Kling task not found (404): {ref.external_task_id}")
            if 400 <= r.status_code < 500:
                return ExternalTaskStatus(state="failed", error=f"Kling query error {r.status_code}: {r.text[:500]}")
            if r.status_code >= 500:
                return ExternalTaskStatus(state="running")  # transient, will retry
            data = r.json()

        if data.get("code") != 0:
            return ExternalTaskStatus(state="failed", error=data.get("message") or "kling_query_failed")

        task = data.get("data") or {}
        status = task.get("task_status")

        if status == "succeed":
            url = ((task.get("task_result") or {}).get("videos") or [{}])[0].get("url")
            if not url:
                return ExternalTaskStatus(state="failed", error="kling_video_url_missing")
            return ExternalTaskStatus(
                state="succeeded",
                progress=100,
                result=MediaResponse(url=url, usage_id=ref.external_task_id, meta=data),
            )
        if status == "failed":
            return ExternalTaskStatus(state="failed", error=task.get("task_status_msg") or "kling_failed")
        if status in {"submitted", "processing"}:
            return ExternalTaskStatus(state="running")
        return ExternalTaskStatus(state="running")
