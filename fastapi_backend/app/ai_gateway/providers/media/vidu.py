import asyncio
import logging
from typing import Any

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.core.exceptions import AppError
from app.schemas_media import MediaRequest, MediaResponse

logger = logging.getLogger(__name__)


def _strip_data_url_prefix(v: str) -> str:
    """Strip ``data:image/...;base64,`` prefix, return raw base64."""
    s = (v or "").strip()
    if s.startswith("data:") and ";base64," in s:
        return s.split(";base64,", 1)[1]
    return s


class ViduMediaProvider(MediaProvider):
    # Vidu API v2 endpoint mapping per mode
    MODE_ENDPOINTS: dict[str, str] = {
        "text2video":  "/text2video",
        "image2video": "/img2video",
        "start_end":   "/img2video/start-end",
        "reference":   "/reference2video",
        "multi_frame": "/img2video/multi-frame",
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
            "prompt": request.prompt,
        }
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
            # First frame image
            if images:
                base["image"] = self._to_image_obj(images[0])

        elif mode == "start_end":
            # First + last frame
            if len(images) >= 1:
                base["image"] = self._to_image_obj(images[0])
            if len(images) >= 2:
                base["image_tail"] = self._to_image_obj(images[1])

        elif mode == "reference":
            # Reference images array
            if images:
                base["images"] = [self._to_image_obj(img) for img in images]

        elif mode == "multi_frame":
            # Keyframe images array
            if images:
                base["frames"] = [
                    {"image": self._to_image_obj(img), "index": idx}
                    for idx, img in enumerate(images)
                ]

        return base

    @staticmethod
    def _to_image_obj(data_url: str) -> dict[str, str]:
        """Convert a data-URL or raw URL to Vidu image payload format."""
        s = (data_url or "").strip()
        if s.startswith("data:"):
            return {"type": "base64", "content": _strip_data_url_prefix(s)}
        return {"type": "url", "content": s}

    # ------------------------------------------------------------------
    # Task polling
    # ------------------------------------------------------------------

    async def _poll_task(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        headers: dict[str, str],
    ) -> MediaResponse:
        task_url = f"{self.base_url}/tasks/{task_id}"

        for attempt in range(self.POLL_MAX_ATTEMPTS):
            await asyncio.sleep(self.POLL_INTERVAL)
            try:
                resp = await client.get(task_url, headers=headers, timeout=15.0)
            except httpx.HTTPError:
                continue
            if resp.status_code != 200:
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
                err_msg = task_data.get("err_msg") or task_data.get("message") or "unknown"
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
