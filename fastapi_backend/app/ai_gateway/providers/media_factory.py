from typing import Optional

from app.ai_gateway.providers.adapters import (
    KlingImageAdapter,
    KlingVideoAdapter,
    OpenAIImageAdapter,
)
from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.media.aliyun import AliyunMediaProvider
from app.ai_gateway.providers.media.gemini import GeminiMediaProvider
from app.ai_gateway.providers.media.gemini_proxy import GeminiProxyProvider
from app.ai_gateway.providers.media.vidu import ViduMediaProvider
from app.ai_gateway.providers.media.volcengine import (
    VolcengineMediaProvider,
    VolcengineVideoProvider,
)
from app.core.exceptions import AppError


class MediaProviderFactory:
    PROVIDER_MAP: dict[str, type[MediaProvider]] = {
        # 图片厂商 - 新体系
        "aliyun": AliyunMediaProvider,
        "volcengine": VolcengineMediaProvider,
        "doubao": VolcengineMediaProvider,
        "gemini": GeminiMediaProvider,
        "google": GeminiMediaProvider,
        "gemini_proxy": GeminiProxyProvider,
        # 图片厂商 - 适配器
        "kling": KlingImageAdapter,
        "openai": OpenAIImageAdapter,
        # 视频厂商 - 新体系
        "volcengine_video": VolcengineVideoProvider,
        "vidu": ViduMediaProvider,
        # 视频厂商 - 适配器
        "kling_video": KlingVideoAdapter,
    }

    def get_provider(
        self,
        manufacturer: str,
        api_key: str,
        base_url: Optional[str] = None,
    ) -> MediaProvider:
        key = manufacturer.lower().strip()
        provider_cls = self.PROVIDER_MAP.get(key)
        if not provider_cls:
            raise AppError(
                msg=f"Unsupported media provider: {manufacturer}",
                code=400,
                status_code=400,
            )
        if base_url:
            return provider_cls(api_key=api_key, base_url=base_url)
        return provider_cls(api_key=api_key)


media_provider_factory = MediaProviderFactory()
