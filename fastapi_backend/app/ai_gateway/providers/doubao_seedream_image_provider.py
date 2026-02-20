from __future__ import annotations

from typing import Any

from app.ai_gateway.providers.kling_common import httpx_client
from app.ai_gateway.types import ResolvedModelConfig


def _ensure_ark_base_url(base_url: str | None) -> str:
    base = (base_url or "https://ark.cn-beijing.volces.com/api/v3").strip().rstrip("/")
    return base


class DoubaoSeedreamImageProvider:
    async def generate_image(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        resolution: str | None,
        image_data_urls: list[str] | None,
    ) -> str:
        url = f"{_ensure_ark_base_url(cfg.base_url)}/images/generations"
        headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}

        body: dict[str, Any] = {"model": cfg.model, "prompt": prompt}
        if resolution and resolution.strip():
            body["size"] = resolution.strip()

        if image_data_urls:
            imgs = [x for x in image_data_urls if isinstance(x, str) and x.strip()]
            if len(imgs) == 1:
                body["image"] = imgs[0]
            elif len(imgs) > 1:
                body["image"] = imgs

        async with httpx_client(timeout_seconds=90.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()

        try:
            first = (data.get("data") or [{}])[0]
        except Exception:
            first = {}

        if isinstance(first, dict):
            u = first.get("url")
            if isinstance(u, str) and u.strip():
                return u.strip()
            b64 = first.get("b64_json")
            if isinstance(b64, str) and b64.strip():
                return f"data:image/png;base64,{b64.strip()}"

        raise RuntimeError("doubao_seedream_no_output")

