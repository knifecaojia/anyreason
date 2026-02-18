from __future__ import annotations

from typing import Any

from app.ai_gateway.providers.kling_common import httpx_client
from app.ai_gateway.types import ResolvedModelConfig


def _models_base_url(base_url: str | None) -> str:
    base = (base_url or "https://generativelanguage.googleapis.com/v1beta").strip().rstrip("/")
    if base.endswith("/models"):
        return base
    return f"{base}/models"


class GeminiImageProvider:
    async def generate_image(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        resolution: str | None,
        image_data_urls: list[str] | None,
    ) -> str:
        if resolution:
            _ = resolution
        if image_data_urls:
            raise RuntimeError("gemini_image_reference_not_supported")

        url = f"{_models_base_url(cfg.base_url)}/{cfg.model}:generateContent?key={cfg.api_key}"
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }

        async with httpx_client(timeout_seconds=90.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise RuntimeError("gemini_image_no_candidates")

        content = (candidates[0] or {}).get("content")
        if not isinstance(content, dict):
            raise RuntimeError("gemini_image_no_content")

        parts = content.get("parts")
        if not isinstance(parts, list) or not parts:
            raise RuntimeError("gemini_image_no_parts")

        for p in parts:
            if not isinstance(p, dict):
                continue
            inline = p.get("inlineData")
            if isinstance(inline, dict):
                mime = str(inline.get("mimeType") or "image/png")
                b64 = inline.get("data")
                if isinstance(b64, str) and b64.strip():
                    return f"data:{mime};base64,{b64.strip()}"

            file_data = p.get("fileData")
            if isinstance(file_data, dict):
                uri = file_data.get("fileUri")
                if isinstance(uri, str) and uri.strip():
                    return uri.strip()

        raise RuntimeError("gemini_image_no_output")

