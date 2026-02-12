from __future__ import annotations

from typing import Any

import httpx

from app.ai_gateway.providers.kling_common import httpx_client, kling_bearer_token, kling_headers, poll_task
from app.ai_gateway.types import ResolvedModelConfig


def _strip_data_url_prefix(v: str) -> str:
    s = (v or "").strip()
    if s.startswith("data:image/") and ";base64," in s:
        return s.split(";base64,", 1)[1]
    return s


class KlingImageProvider:
    async def generate_image(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        resolution: str | None,
        image_data_urls: list[str] | None,
    ) -> str:
        token = kling_bearer_token(cfg.api_key)
        base_url = (cfg.base_url or "https://api-beijing.klingai.com/v1/images/omni-image").rstrip("/")
        headers = kling_headers(token=token)

        image_list = []
        for img in list(image_data_urls or []):
            raw = _strip_data_url_prefix(img)
            if raw:
                image_list.append({"image": raw})

        body: dict[str, Any] = {"model_name": cfg.model or "kling-image-o1", "prompt": prompt, "n": 1}
        if resolution and resolution.strip() and resolution.strip().upper() != "4K":
            body["resolution"] = resolution.strip().lower()
        if image_list:
            body["image_list"] = image_list

        async with httpx_client(timeout_seconds=60.0) as client:
            resp = await client.post(base_url, headers=headers, json=body)
            resp.raise_for_status()
            create_data = resp.json()

        if create_data.get("code") != 0:
            raise RuntimeError(create_data.get("message") or "kling_create_task_failed")

        task_id = (create_data.get("data") or {}).get("task_id")
        if not task_id:
            raise RuntimeError("kling_task_id_missing")

        query_url = f"{base_url}/{task_id}"

        async def _query():
            async with httpx_client(timeout_seconds=60.0) as client:
                r = await client.get(query_url, headers=headers)
                r.raise_for_status()
                data = r.json()
            if data.get("code") != 0:
                return False, None, data.get("message") or "kling_query_failed"
            d = data.get("data") or {}
            status = d.get("task_status")
            if status == "failed":
                return False, None, d.get("task_status_msg") or "kling_failed"
            if status == "succeed":
                url = ((d.get("task_result") or {}).get("images") or [{}])[0].get("url")
                return True, url, None
            return False, None, None

        try:
            return await poll_task(query_fn=_query)
        except httpx.HTTPError as e:
            raise RuntimeError(str(e))

