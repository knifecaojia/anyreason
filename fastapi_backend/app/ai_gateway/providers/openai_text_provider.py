from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI

from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched
from app.ai_gateway.types import ResolvedModelConfig


class OpenAITextProvider:
    async def chat_completions(
        self,
        *,
        cfg: ResolvedModelConfig,
        messages: list[dict[str, Any]],
        timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        ensure_openai_compat_patched()
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
        resp = await client.chat.completions.create(
            model=cfg.model,
            messages=messages,
            timeout=timeout_seconds,
        )
        return resp.model_dump(by_alias=True)

    async def chat_completions_stream(
        self,
        *,
        cfg: ResolvedModelConfig,
        messages: list[dict[str, Any]],
        timeout_seconds: float | None = None,
    ) -> AsyncIterator[str]:
        ensure_openai_compat_patched()
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
        stream = await client.chat.completions.create(
            model=cfg.model,
            messages=messages,
            timeout=timeout_seconds,
            stream=True,
        )
        async for chunk in stream:
            try:
                delta = chunk.choices[0].delta.content
            except Exception:
                delta = None
            if delta:
                yield str(delta)
