from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from litellm.integrations.custom_logger import CustomLogger


def _get_usage(response: Any) -> dict[str, Any]:
    if response is None:
        return {}
    if isinstance(response, dict):
        usage = response.get("usage")
        return usage if isinstance(usage, dict) else {}
    usage = getattr(response, "usage", None)
    return usage if isinstance(usage, dict) else {}


class AnyreasonProxyWebhook(CustomLogger):
    async def async_post_call_success_hook(
        self,
        data: dict,
        user_api_key_dict: Any,
        response: Any,
    ) -> Any:
        url = os.getenv("LITELLM_WEBHOOK_URL")
        if not url:
            return response

        secret = os.getenv("LITELLM_WEBHOOK_SECRET")
        headers = {"Content-Type": "application/json"}
        if secret:
            headers["x-litellm-webhook-secret"] = secret

        metadata: dict[str, Any] = {}
        if hasattr(user_api_key_dict, "metadata") and isinstance(user_api_key_dict.metadata, dict):
            metadata.update(user_api_key_dict.metadata)
        if hasattr(user_api_key_dict, "user_id") and user_api_key_dict.user_id:
            metadata.setdefault("user_id", str(user_api_key_dict.user_id))

        token = getattr(user_api_key_dict, "token", None)
        if isinstance(token, str) and token:
            metadata.setdefault("key_prefix", token[:12])

        payload: dict[str, Any] = {
            "model": data.get("model"),
            "endpoint": data.get("endpoint") or data.get("call_type"),
            "request_id": data.get("request_id") or getattr(user_api_key_dict, "request_id", None),
            "metadata": metadata,
            "usage": _get_usage(response),
            "latency_ms": None,
            "cost": None,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

        extra_cost = getattr(response, "_hidden_params", {}).get("response_cost", None)
        if extra_cost is None:
            extra_cost = data.get("response_cost")
        payload["cost"] = extra_cost

        def _send() -> None:
            try:
                requests.post(url, json=payload, headers=headers, timeout=3)
            except Exception:
                return

        asyncio.create_task(asyncio.to_thread(_send))
        return response


proxy_handler_instance = AnyreasonProxyWebhook()
