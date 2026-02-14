from __future__ import annotations

import pytest

from app.ai_gateway.providers.openai_text_provider import OpenAITextProvider
from app.ai_gateway.types import ResolvedModelConfig


class _FakeResp:
    def model_dump(self, *, by_alias: bool):
        assert isinstance(by_alias, bool)
        return {"ok": True}


class _FakeChatCompletions:
    async def create(self, **kwargs):
        _ = kwargs
        return _FakeResp()


class _FakeChat:
    def __init__(self):
        self.completions = _FakeChatCompletions()


class _FakeAsyncOpenAI:
    def __init__(self, **kwargs):
        _ = kwargs
        self.chat = _FakeChat()


@pytest.mark.asyncio
async def test_openai_text_provider_model_dump_passes_by_alias_bool(monkeypatch):
    import app.ai_gateway.providers.openai_text_provider as mod

    monkeypatch.setattr(mod, "AsyncOpenAI", _FakeAsyncOpenAI)

    provider = OpenAITextProvider()
    cfg = ResolvedModelConfig(category="text", manufacturer="openai", model="gpt-4o-mini", base_url=None, api_key="k")
    out = await provider.chat_completions(cfg=cfg, messages=[{"role": "user", "content": "hi"}], timeout_seconds=1.0)
    assert out == {"ok": True}

