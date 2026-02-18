from __future__ import annotations

from typing import Any

import httpx

from app.ai_gateway.providers.kling_common import httpx_client
from app.ai_gateway.types import ResolvedModelConfig


def _ensure_v1_base_url(base_url: str | None) -> str:
    base = (base_url or "https://api.openai.com").strip().rstrip("/")
    if base.endswith("/v1"):
        return base
    return f"{base}/v1"


class OpenAIImageProvider:
    async def generate_image(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        resolution: str | None,
        image_data_urls: list[str] | None,
    ) -> str:
        if image_data_urls:
            raise RuntimeError("openai_image_reference_not_supported")

        url = f"{_ensure_v1_base_url(cfg.base_url)}/images/generations"
        headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}

        body: dict[str, Any] = {"model": cfg.model, "prompt": prompt, "n": 1}
        if resolution and resolution.strip():
            body["size"] = resolution.strip()

        body["response_format"] = "b64_json"

        async with httpx_client(timeout_seconds=90.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()

        try:
            first = (data.get("data") or [{}])[0]
        except Exception:
            first = {}

        if isinstance(first, dict):
            b64 = first.get("b64_json")
            if isinstance(b64, str) and b64.strip():
                return f"data:image/png;base64,{b64.strip()}"
            u = first.get("url")
            if isinstance(u, str) and u.strip():
                return u.strip()

        raise RuntimeError("openai_image_no_output")

