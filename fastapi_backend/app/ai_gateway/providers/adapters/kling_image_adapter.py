from __future__ import annotations

from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.kling_image_provider import KlingImageProvider
from app.ai_gateway.types import ResolvedModelConfig
from app.schemas_media import MediaRequest, MediaResponse


class KlingImageAdapter(MediaProvider):
    """Adapter that bridges KlingImageProvider to the unified MediaProvider interface."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self._provider = KlingImageProvider()
        self._api_key = api_key
        self._base_url = base_url

    async def generate(self, request: MediaRequest) -> MediaResponse:
        cfg = ResolvedModelConfig(
            category="image",
            manufacturer="kling",
            model=request.model_key,
            api_key=self._api_key,
            base_url=self._base_url,
        )
        url = await self._provider.generate_image(
            cfg=cfg,
            prompt=request.prompt,
            resolution=request.param_json.get("resolution"),
            image_data_urls=request.param_json.get("image_data_urls"),
        )
        return MediaResponse(url=url, usage_id="", meta={})
