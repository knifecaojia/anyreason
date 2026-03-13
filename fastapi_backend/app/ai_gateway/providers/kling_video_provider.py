from __future__ import annotations

import re
from typing import Any

import httpx

from app.ai_gateway.providers.kling_common import httpx_client, kling_bearer_token, kling_headers, poll_task
from app.ai_gateway.types import ResolvedModelConfig


def _strip_data_url_prefix(v: str) -> str:
    s = (v or "").strip()
    if s.startswith("data:image/") and ";base64," in s:
        return s.split(";base64,", 1)[1]
    return s


class KlingVideoProvider:
    async def generate_video(
        self,
        *,
        cfg: ResolvedModelConfig,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        image_data_urls: list[str] | None,
    ) -> str:
        token = kling_bearer_token(cfg.api_key)
        headers = kling_headers(token=token)

        default_base_url = (
            "https://api-beijing.klingai.com/v1/videos/image2video|"
            "https://api-beijing.klingai.com/v1/videos/text2video|"
            "https://api-beijing.klingai.com/v1/videos/text2video/{taskId}"
        )
        base_url = (cfg.base_url or default_base_url).strip()
        parts = [p.strip() for p in base_url.split("|") if p.strip()]
        if len(parts) != 3:
            raise RuntimeError("kling_base_url_invalid")
        image2video_url, text2video_url, query_url_tpl = parts

        images = [i for i in list(image_data_urls or []) if (i or "").strip()]
        has_image = len(images) > 0
        create_url = image2video_url if has_image else text2video_url

        model_name = cfg.model
        mode = "std"
        m = re.match(r"^(.+)\((STD|PRO)\)$", (cfg.model or "").strip(), flags=re.IGNORECASE)
        if m:
            model_name = m.group(1)
            mode = m.group(2).lower()

        body: dict[str, Any] = {
            "model_name": model_name,
            "mode": mode,
            "duration": str(int(duration)),
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
        }
        if has_image:
            body["image"] = _strip_data_url_prefix(images[0])
            if len(images) > 1:
                body["image_tail"] = _strip_data_url_prefix(images[1])

        async with httpx_client(timeout_seconds=120.0) as client:
            resp = await client.post(create_url, headers=headers, json=body)
            resp.raise_for_status()
            create_data = resp.json()

        if create_data.get("code") != 0:
            raise RuntimeError(create_data.get("message") or "kling_create_task_failed")

        task_id = (create_data.get("data") or {}).get("task_id")
        if not task_id:
            raise RuntimeError("kling_task_id_missing")

        query_url = query_url_tpl.replace("{taskId}", str(task_id))

        async def _query():
            async with httpx_client(timeout_seconds=120.0) as client:
                r = await client.get(query_url, headers=headers)
                r.raise_for_status()
                data = r.json()
            if data.get("code") != 0:
                return False, None, data.get("message") or "kling_query_failed"
            task = data.get("data") or {}
            status = task.get("task_status")
            if status == "succeed":
                url = ((task.get("task_result") or {}).get("videos") or [{}])[0].get("url")
                if not url:
                    return False, None, "kling_video_url_missing"
                return True, url, None
            if status == "failed":
                return False, None, task.get("task_status_msg") or "kling_failed"
            if status in {"submitted", "processing"}:
                return False, None, None
            return False, None, f"kling_unknown_status_{status}"

        try:
            return await poll_task(query_fn=_query)
        except httpx.HTTPError as e:
            raise RuntimeError(str(e))

