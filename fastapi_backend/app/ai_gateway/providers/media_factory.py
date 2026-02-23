from typing import Optional
from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.media.volcengine import VolcengineMediaProvider, VolcengineVideoProvider
from app.ai_gateway.providers.media.aliyun import AliyunMediaProvider
from app.ai_gateway.providers.media.vidu import ViduMediaProvider
from app.ai_gateway.providers.media.gemini import GeminiMediaProvider
from app.core.exceptions import AppError

class MediaProviderFactory:
    def get_provider(self, manufacturer: str, api_key: str, base_url: Optional[str] = None) -> MediaProvider:
        manufacturer = manufacturer.lower().strip()
        
        if manufacturer == "volcengine":
            return VolcengineMediaProvider(api_key=api_key, base_url=base_url) if base_url else VolcengineMediaProvider(api_key=api_key)
        elif manufacturer == "volcengine_video":
             return VolcengineVideoProvider(api_key=api_key, base_url=base_url) if base_url else VolcengineVideoProvider(api_key=api_key)
        elif manufacturer == "aliyun":
            return AliyunMediaProvider(api_key=api_key, base_url=base_url) if base_url else AliyunMediaProvider(api_key=api_key)
        elif manufacturer == "vidu":
            return ViduMediaProvider(api_key=api_key, base_url=base_url) if base_url else ViduMediaProvider(api_key=api_key)
        elif manufacturer == "google" or manufacturer == "gemini":
            return GeminiMediaProvider(api_key=api_key, base_url=base_url) if base_url else GeminiMediaProvider(api_key=api_key)
        
        raise AppError(msg=f"Unsupported media provider: {manufacturer}", code=400)

media_provider_factory = MediaProviderFactory()
