from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from app.ai_gateway.types import ResolvedModelConfig


class OpenAITextProvider:
    async def chat_completions(
        self,
        *,
        cfg: ResolvedModelConfig,
        messages: list[dict[str, Any]],
        timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
        resp = await client.chat.completions.create(
            model=cfg.model,
            messages=messages,
            timeout=timeout_seconds,
        )
        return resp.model_dump()

