from __future__ import annotations

from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.kling_video_provider import KlingVideoProvider
from app.ai_gateway.types import ResolvedModelConfig
from app.schemas_media import MediaRequest, MediaResponse


class KlingVideoAdapter(MediaProvider):
    """Adapter that bridges KlingVideoProvider to the unified MediaProvider interface."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self._provider = KlingVideoProvider()
        self._api_key = api_key
        self._base_url = base_url

    async def generate(self, request: MediaRequest) -> MediaResponse:
        cfg = ResolvedModelConfig(
            category="video",
            manufacturer="kling",
            model=request.model_key,
            api_key=self._api_key,
            base_url=self._base_url,
        )
        url = await self._provider.generate_video(
            cfg=cfg,
            prompt=request.prompt,
            duration=request.param_json.get("duration", 5),
            aspect_ratio=request.param_json.get("aspect_ratio", "16:9"),
            image_data_urls=request.param_json.get("image_data_urls"),
        )
        return MediaResponse(url=url, usage_id="", meta={})
