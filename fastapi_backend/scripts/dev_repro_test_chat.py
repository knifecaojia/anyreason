from __future__ import annotations

import asyncio
import os

import httpx


async def main() -> None:
    base = os.getenv("BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    email = os.getenv("EMAIL", "admin@example.com")
    password = os.getenv("PASSWORD", "admin123")
    model_config_id = os.getenv("MODEL_CONFIG_ID", "")
    if not model_config_id:
        raise SystemExit("MODEL_CONFIG_ID is required")

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{base}/auth/jwt/login", data={"username": email, "password": password})
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        body = {"messages": [{"role": "user", "content": "ping"}]}
        r2 = await c.post(f"{base}/api/v1/ai/admin/model-configs/{model_config_id}/test-chat", json=body, headers=headers)
        print("status", r2.status_code)
        print(r2.text)


if __name__ == "__main__":
    asyncio.run(main())

