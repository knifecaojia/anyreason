from __future__ import annotations

from app.ai_gateway.providers import (
    OpenAITextProvider,
)


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
            "gemini": openai_compatible,
            "anthropic": openai_compatible,
            "newapi": openai_compatible,
            "other": openai_compatible,
        }

    def get_text_provider(self, *, manufacturer: str):
        m = (manufacturer or "").strip().lower()
        p = self._text.get(m)
        if p is None:
            p = self._text.get("other")
        if p is None:
            raise KeyError(m)
        return p


provider_factory = ProviderFactory()
