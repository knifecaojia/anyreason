from __future__ import annotations

from typing import Any
import asyncio

from volcenginesdkarkruntime import AsyncArk
from app.ai_gateway.types import ResolvedModelConfig
from app.log.log import logger


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
        def _image_meta(val: str) -> dict[str, Any]:
            s = (val or "").strip()
            mime: str | None = None
            if s.startswith("data:"):
                idx = s.find(";base64,")
                if idx > 5:
                    mime = s[5:idx].strip() or None
            return {"mime": mime, "length": len(s)}

        primary_base = _ensure_ark_base_url(cfg.base_url)
        
        # Initialize AsyncArk client
        client = AsyncArk(
            api_key=cfg.api_key,
            base_url=primary_base,
            timeout=1800,  # Recommended timeout for long-running tasks
            max_retries=2
        )

        # Prepare request parameters
        params: dict[str, Any] = {
            "model": cfg.model,
            "prompt": prompt,
            "response_format": "url"  # Or "b64_json" if needed
        }
        
        if resolution and resolution.strip():
            params["size"] = resolution.strip()

        imgs: list[str] = []
        if image_data_urls:
            imgs = [x for x in image_data_urls if isinstance(x, str) and x.strip()]
            if len(imgs) == 1:
                params["image"] = imgs[0]
            elif len(imgs) > 1:
                params["image"] = imgs

        summary = {
            "model": cfg.model,
            "size": params.get("size"),
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

        try:
            # Call the images generation API
            response = await client.images.generate(**params)
            
            # Extract the image URL
            if response.data and len(response.data) > 0:
                first = response.data[0]
                if hasattr(first, "url") and first.url:
                    return first.url
                if hasattr(first, "b64_json") and first.b64_json:
                    return f"data:image/png;base64,{first.b64_json}"
            
            raise RuntimeError("doubao_seedream_no_output")
            
        except Exception as e:
            logger.bind(
                context={
                    "category": "image",
                    "provider": "doubao_seedream",
                }
            ).error(f"ai_gateway.doubao_seedream.failed error={str(e)} payload={summary}")
            raise e
