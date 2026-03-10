import asyncio
import logging
from typing import Any

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.core.exceptions import AppError
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse

logger = logging.getLogger(__name__)


class ViduMediaProvider(MediaProvider):
    # Vidu API v2 endpoint mapping per mode
    MODE_ENDPOINTS: dict[str, str] = {
        "text2video":  "/text2video",
        "image2video": "/img2video",
        "start_end":   "/start-end2video",
        "reference":   "/reference2video",
        "multi_frame": "/multiframe",
    }

    POLL_INTERVAL = 2        # seconds between polls
    POLL_MAX_ATTEMPTS = 180  # ~6 minutes

    def __init__(self, api_key: str, base_url: str = "https://api.vidu.cn/ent/v2"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def generate(self, request: MediaRequest) -> MediaResponse:
        mode = request.param_json.get("mode", "text2video")
        endpoint = self.MODE_ENDPOINTS.get(mode)
        if not endpoint:
            raise AppError(
                msg=f"Unsupported Vidu mode: {mode}",
                code=400,
                status_code=400,
            )

        url = f"{self.base_url}{endpoint}"
        payload = self._build_payload(mode, request)
        headers = self._headers()

        logger.info(
            "[vidu] submit mode=%s model=%s endpoint=%s payload_keys=%s",
            mode, request.model_key, endpoint, list(payload.keys()),
        )

        async with httpx.AsyncClient() as client:
            # 1. Submit task
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code not in (200, 201):
                raise AppError(
                    msg=f"Vidu Submit Error: {resp.status_code}",
                    data={"raw": resp.text[:2000]},
                    code=502,
                    status_code=502,
                )

            data = resp.json()
            task_id = data.get("task_id")
            if not task_id:
                raise AppError(
                    msg="Vidu API returned no task_id",
                    data=data,
                    code=502,
                    status_code=502,
                )

            logger.info("[vidu] task_id=%s submitted", task_id)

            # 2. Poll task
            return await self._poll_task(client, task_id, headers)

    # ------------------------------------------------------------------
    # Payload builders
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, mode: str, request: MediaRequest) -> dict[str, Any]:
        pj = request.param_json
        base: dict[str, Any] = {
            "model": request.model_key,
        }
        # Only add prompt if it exists (some modes like multiframe might not use top-level prompt)
        if request.prompt:
            base["prompt"] = request.prompt
            
        # Common optional fields
        if pj.get("duration"):
            base["duration"] = int(pj["duration"])
        if pj.get("aspect_ratio"):
            base["aspect_ratio"] = str(pj["aspect_ratio"])
        if pj.get("resolution"):
            base["resolution"] = str(pj["resolution"])
        if pj.get("style"):
            base["style"] = str(pj["style"])
        if pj.get("enhance"):
            base["enhance"] = bool(pj["enhance"])
        if pj.get("seed") is not None:
            base["seed"] = pj["seed"]
        if request.callback_url:
            base["callback_url"] = request.callback_url

        images: list[str] = pj.get("image_data_urls") or []

        if mode == "text2video":
            pass  # no image fields

        elif mode == "image2video":
            # Image to video expects an array of exactly 1 string (URL or Data URI)
            if images:
                base["images"] = [self._format_image_string(images[0])]

        elif mode == "start_end":
            # Start-End mode expects an array of exactly 2 strings
            if len(images) >= 2:
                base["images"] = [
                    self._format_image_string(images[0]),
                    self._format_image_string(images[1]),
                ]
            elif len(images) == 1: # Fallback if only 1 image provided
                base["images"] = [self._format_image_string(images[0])]

        elif mode == "reference":
            # Reference images array
            if images:
                base["images"] = [self._format_image_string(img) for img in images]

        elif mode == "multi_frame":
            # Multi-frame completely drops `prompt` and uses `start_image` and `image_settings`
            base.pop("prompt", None)  # Ensure root prompt is removed
            if images:
                base["start_image"] = self._format_image_string(images[0])
                # Provide subsequent frames in image_settings
                if len(images) > 1:
                    base["image_settings"] = [
                        {"key_image": self._format_image_string(img)} 
                        for img in images[1:]
                    ]
                else:
                    # Fallback rule: API requires at least 2 frames (1 start + 1 keyframe) 
                    # but if user gave 1, we still follow structure to fail gracefully
                    base["image_settings"] = []
                    
        return base

    @staticmethod
    def _format_image_string(data_url: str) -> str:
        """Convert a raw URL or prefix string directly. Do NOT strip the Data URI prefix or return an object."""
        return (data_url or "").strip()

    # ------------------------------------------------------------------
    # Task polling
    # ------------------------------------------------------------------

    async def _poll_task(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        headers: dict[str, str],
    ) -> MediaResponse:
        task_url = f"{self.base_url}/tasks/{task_id}/creations"

        for attempt in range(self.POLL_MAX_ATTEMPTS):
            await asyncio.sleep(self.POLL_INTERVAL)
            try:
                resp = await client.get(task_url, headers=headers, timeout=15.0)
            except httpx.HTTPError as e:
                logger.warning("[vidu] poll httpx error task_id=%s attempt=%d error=%s", task_id, attempt, e)
                continue
            if resp.status_code != 200:
                if attempt % 10 == 0:
                    logger.warning("[vidu] poll task_id=%s attempt=%d status=%s response=%s", task_id, attempt, resp.status_code, resp.text[:200])
                continue

            task_data = resp.json()
            state = task_data.get("state")

            if state == "success":
                video_url = self._extract_video_url(task_data)
                if not video_url:
                    raise AppError(
                        msg="Vidu Task succeeded but no video URL found",
                        data=task_data,
                        code=502,
                        status_code=502,
                    )
                logger.info("[vidu] task_id=%s success url_len=%d", task_id, len(video_url))
                return MediaResponse(
                    url=video_url,
                    usage_id=task_id,
                    meta=task_data,
                )

            if state == "failed":
                err_msg = task_data.get("err_code") or task_data.get("message") or "unknown"
                raise AppError(
                    msg=f"Vidu Task Failed: {err_msg}",
                    data=task_data,
                    code=502,
                    status_code=502,
                )

            # still processing – continue polling
            if attempt > 0 and attempt % 30 == 0:
                logger.info("[vidu] task_id=%s still %s after %ds", task_id, state, attempt * self.POLL_INTERVAL)

        raise AppError(msg="Vidu Task Timeout (>6min)", code=504, status_code=504)

    @staticmethod
    def _extract_video_url(task_data: dict[str, Any]) -> str | None:
        """Try multiple response shapes to find the video URL."""
        creations = task_data.get("creations") or []
        if creations:
            return creations[0].get("url")
        if "url" in task_data:
            return task_data["url"]
        if "mp4_url" in task_data:
            return task_data["mp4_url"]
        return None

    # ------------------------------------------------------------------
    # Two-phase async interface
    # ------------------------------------------------------------------

    @property
    def supports_async(self) -> bool:
        return True

    async def submit_async(self, request: MediaRequest) -> ExternalTaskRef:
        mode = request.param_json.get("mode", "text2video")
        endpoint = self.MODE_ENDPOINTS.get(mode)
        if not endpoint:
            raise AppError(msg=f"Unsupported Vidu mode: {mode}", code=400, status_code=400)

        url = f"{self.base_url}{endpoint}"
        payload = self._build_payload(mode, request)
        headers = self._headers()

        logger.info("[vidu-async] submit mode=%s model=%s endpoint=%s", mode, request.model_key, endpoint)

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code not in (200, 201):
                logger.error("[vidu-async] Vidu Submit Error HTTP %d: %s", resp.status_code, resp.text)
                raise AppError(
                    msg=f"Vidu Submit Error: {resp.status_code}",
                    data={"raw": resp.text[:2000]},
                    code=502, status_code=502,
                )
            data = resp.json()
            task_id = data.get("task_id")
            if not task_id:
                raise AppError(msg="Vidu API returned no task_id", data=data, code=502, status_code=502)

        logger.info("[vidu-async] task_id=%s submitted", task_id)
        return ExternalTaskRef(
            external_task_id=str(task_id),
            provider="vidu",
            meta={"api_key": self.api_key, "base_url": self.base_url},
        )

    async def query_status(self, ref: ExternalTaskRef) -> ExternalTaskStatus:
        base_url = ref.meta.get("base_url", self.base_url)
        api_key = ref.meta.get("api_key", self.api_key)
        task_url = f"{base_url}/tasks/{ref.external_task_id}/creations"
        headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(task_url, headers=headers, timeout=15.0)
            except httpx.HTTPError as e:
                # Network / timeout — treat as transient, will retry
                logger.warning("[vidu-query] transient error task=%s: %s", ref.external_task_id, e)
                return ExternalTaskStatus(state="running")
            if resp.status_code == 404:
                return ExternalTaskStatus(state="failed", error=f"Vidu task not found (404): {ref.external_task_id}")
            if resp.status_code >= 400 and resp.status_code < 500:
                logger.warning("[vidu-query] task=%s query error %d response=%s", ref.external_task_id, resp.status_code, resp.text[:200])
                return ExternalTaskStatus(state="failed", error=f"Vidu query error {resp.status_code}: {resp.text[:500]}")
            if resp.status_code >= 500:
                # Server error — transient, will retry
                logger.warning("[vidu-query] server error %d task=%s", resp.status_code, ref.external_task_id)
                return ExternalTaskStatus(state="running")
            task_data = resp.json()

        state = task_data.get("state")
        if state == "success":
            video_url = self._extract_video_url(task_data)
            if not video_url:
                return ExternalTaskStatus(state="failed", error="Vidu: no video URL in success response")
            return ExternalTaskStatus(
                state="succeeded",
                progress=100,
                result=MediaResponse(url=video_url, usage_id=ref.external_task_id, meta=task_data),
            )
        if state == "failed":
            err_msg = task_data.get("err_msg") or task_data.get("message") or "unknown"
            return ExternalTaskStatus(state="failed", error=f"Vidu Task Failed: {err_msg}")
        return ExternalTaskStatus(state="running")
