from __future__ import annotations

from app.ai_gateway.providers import KlingImageProvider, KlingVideoProvider, OpenAITextProvider


class ProviderFactory:
    def __init__(self) -> None:
        openai_compatible = OpenAITextProvider()
        self._text = {
            "openai": openai_compatible,
            "qwen": openai_compatible,
            "deepseek": openai_compatible,
            "zhipu": openai_compatible,
            "doubao": openai_compatible,
            "xai": openai_compatible,
            "other": openai_compatible,
        }
        self._image = {"kling": KlingImageProvider()}
        self._video = {"kling": KlingVideoProvider()}

    def get_text_provider(self, *, manufacturer: str):
        m = (manufacturer or "").strip().lower()
        p = self._text.get(m)
        if p is None:
            raise KeyError(m)
        return p

    def get_image_provider(self, *, manufacturer: str):
        m = (manufacturer or "").strip().lower()
        p = self._image.get(m)
        if p is None:
            raise KeyError(m)
        return p

    def get_video_provider(self, *, manufacturer: str):
        m = (manufacturer or "").strip().lower()
        p = self._video.get(m)
        if p is None:
            raise KeyError(m)
        return p


provider_factory = ProviderFactory()
