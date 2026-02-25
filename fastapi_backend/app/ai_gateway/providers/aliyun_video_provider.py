"""
AliyunVideoProvider — 适配旧 factory 接口，桥接到 AliyunMediaProvider。
"""

from __future__ import annotations

from typing import Any

from app.ai_gateway.providers.media.aliyun import AliyunMediaProvider
from app.ai_gateway.types import ResolvedModelConfig
from app.schemas_media import MediaRequest


class AliyunVideoProvider:
    """Adapts AliyunMediaProvider to the legacy generate_video interface."""

    async def generate_video(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        image_data_urls: list[str] | None,
    ) -> str:
        provider = AliyunMediaProvider(
            api_key=cfg.api_key,
            base_url=cfg.base_url or "https://dashscope.aliyuncs.com/api/v1",
        )

        param_json: dict[str, Any] = {}
        if duration:
            param_json["duration"] = duration
        if aspect_ratio:
            param_json["aspect_ratio"] = aspect_ratio

        # 首帧图片 → first_frame_image
        images = [i for i in (image_data_urls or []) if (i or "").strip()]
        if images:
            param_json["first_frame_image"] = images[0]
            if len(images) > 1:
                param_json["last_frame_image"] = images[1]

        request = MediaRequest(
            model_key=cfg.model,
            prompt=prompt,
            param_json=param_json,
        )

        response = await provider.generate(request)
        return response.url
