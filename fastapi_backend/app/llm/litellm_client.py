from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx


class LiteLLMClient:
    def __init__(self, *, base_url: str, master_key: str, timeout_seconds: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._master_key = master_key
        self._timeout = httpx.Timeout(timeout_seconds)

    async def generate_key(
        self,
        *,
        models: list[str] | None = None,
        metadata: dict[str, Any],
        duration: timedelta | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"metadata": metadata}
        if models is not None:
            payload["models"] = models
        if duration is not None:
            seconds = int(duration.total_seconds())
            payload["duration"] = f"{seconds}s"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/key/generate",
                headers={
                    "Authorization": f"Bearer {self._master_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_models(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{self._base_url}/model/info",
                headers={"Authorization": f"Bearer {self._master_key}"},
            )
            resp.raise_for_status()
            return resp.json()

    async def add_model(
        self,
        *,
        model_name: str,
        litellm_params: dict[str, Any],
        model_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"model_name": model_name, "litellm_params": litellm_params}
        if model_info is not None:
            payload["model_info"] = model_info

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/model/new",
                headers={
                    "Authorization": f"Bearer {self._master_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def revoke_key(self, *, key: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            for path in ("/key/revoke", "/key/delete"):
                for payload in ({"key": key}, {"keys": [key]}, {"tokens": [key]}):
                    resp = await client.post(
                        f"{self._base_url}{path}",
                        headers={
                            "Authorization": f"Bearer {self._master_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    if resp.status_code == 404:
                        break
                    if resp.status_code == 422:
                        continue
                    resp.raise_for_status()
                    return resp.json()
            raise httpx.HTTPStatusError(
                "LiteLLM revoke endpoint not found",
                request=httpx.Request("POST", f"{self._base_url}/key/revoke"),
                response=httpx.Response(404),
            )
