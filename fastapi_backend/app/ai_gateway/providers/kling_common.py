from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import jwt


def _generate_jwt_token(*, ak: str, sk: str) -> str:
    now = int(time.time())
    payload = {"iss": ak, "exp": now + 1800, "nbf": now - 5}
    return jwt.encode(payload, sk, algorithm="HS256", headers={"alg": "HS256", "typ": "JWT"})


def kling_bearer_token(api_key: str) -> str:
    trimmed = (api_key or "").strip()
    trimmed = trimmed.removeprefix("Bearer ").removeprefix("bearer ").strip()
    if "|" in trimmed:
        parts = [p.strip() for p in trimmed.split("|")]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("invalid_kling_api_key_format")
        return _generate_jwt_token(ak=parts[0], sk=parts[1])
    return trimmed


async def poll_task(
    *,
    query_fn,
    max_attempts: int = 120,
    interval_ms: int = 2000,
) -> str:
    for _ in range(max_attempts):
        await asyncio.sleep(interval_ms / 1000.0)
        completed, url, error = await query_fn()
        if error:
            raise RuntimeError(error)
        if completed and url:
            return url
    raise RuntimeError(f"poll_timeout_attempts_{max_attempts}")


def httpx_client(*, timeout_seconds: float = 60.0) -> httpx.AsyncClient:
    timeout = httpx.Timeout(timeout=timeout_seconds, connect=10.0)
    return httpx.AsyncClient(timeout=timeout)


def kling_headers(*, token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
