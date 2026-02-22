from __future__ import annotations

from typing import Any

from app.ai_gateway.providers.kling_common import httpx_client
from app.ai_gateway.types import ResolvedModelConfig
from app.log.log import logger


def _ensure_ark_base_url(base_url: str | None) -> str:
    base = (base_url or "https://ark.cn-beijing.volces.com/api/v3").strip().rstrip("/")
    return base

def _ensure_openvolc_base_url(base_url: str | None) -> str:
    base = (base_url or "https://api.openvolc.ai/v3").strip().rstrip("/")
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
        def _image_meta(val: str) -> dict[str, Any]:
            s = (val or "").strip()
            mime: str | None = None
            if s.startswith("data:"):
                idx = s.find(";base64,")
                if idx > 5:
                    mime = s[5:idx].strip() or None
            return {"mime": mime, "length": len(s)}

        primary_base = _ensure_ark_base_url(cfg.base_url)
        url = f"{primary_base}/images/generations"
        headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}

        body: dict[str, Any] = {"model": cfg.model, "prompt": prompt}
        if resolution and resolution.strip():
            body["size"] = resolution.strip()

        imgs: list[str] = []
        if image_data_urls:
            imgs = [x for x in image_data_urls if isinstance(x, str) and x.strip()]
            if len(imgs) == 1:
                body["image"] = imgs[0]
            elif len(imgs) > 1:
                body["image"] = imgs

        summary = {
            "model": cfg.model,
            "size": body.get("size"),
            "prompt_len": len((prompt or "").strip()),
            "image_count": len(imgs),
            "images": [_image_meta(x) for x in imgs],
        }
        logger.bind(
            context={
                "category": "image",
                "provider": "doubao_seedream",
            }
        ).info(f"ai_gateway.doubao_seedream.request {summary}")

        async with httpx_client(timeout_seconds=90.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                text = resp.text or ""
                if len(text) > 2000:
                    text = text[:2000]
                logger.bind(
                    context={
                        "category": "image",
                        "provider": "doubao_seedream",
                    }
                ).error(f"ai_gateway.doubao_seedream.failed status={resp.status_code} response={text} payload={summary}")
                try:
                    err = resp.json().get("error") or {}
                    code = (err.get("code") or "").strip()
                    typ = (err.get("type") or "").strip().lower()
                except Exception:
                    code = ""
                    typ = ""
                if (code == "AuthenticationError" or typ == "unauthorized") and ("ark.cn-beijing.volces.com" in primary_base):
                    fallback_base = _ensure_openvolc_base_url(None)
                    url2 = f"{fallback_base}/images/generations"
                    resp2 = await client.post(url2, headers=headers, json=body)
                    resp2.raise_for_status()
                    data = resp2.json()
                else:
                    resp.raise_for_status()
                    data = resp.json()
            else:
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
