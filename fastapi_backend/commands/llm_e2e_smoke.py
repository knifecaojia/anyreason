import asyncio
import json
import os
import time

import requests
from dotenv import load_dotenv
from sqlalchemy import func, select

from app.config import settings
from app.database import async_session_maker
from app.models import LLMUsageEvent, User
from app.services.llm_key_service import llm_key_service


load_dotenv()


async def main() -> None:
    async with async_session_maker() as session:
        user_id = (
            await session.execute(select(User.id).where(User.is_superuser.is_(True)).order_by(User.id.desc()))
        ).scalars().first()
        if user_id is None:
            user_id = (await session.execute(select(User.id).order_by(User.id.desc()))).scalars().first()
        if user_id is None:
            raise RuntimeError("no user found in database")

        before_count = (
            await session.execute(select(func.count(LLMUsageEvent.id)).where(LLMUsageEvent.user_id == user_id))
        ).scalar_one()

        virtual_key, row = await llm_key_service.issue_my_key(db=session, user_id=user_id, purpose="default")
        key_id = row.id

        litellm_base_url = os.getenv("LITELLM_BASE_URL", settings.LITELLM_BASE_URL).rstrip("/")
        resp = requests.post(
            f"{litellm_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {virtual_key}", "Content-Type": "application/json"},
            data=json.dumps(
                {
                    "model": "mock",
                    "messages": [{"role": "user", "content": "ping"}],
                    "stream": False,
                }
            ),
            timeout=30,
        )
        resp.raise_for_status()

        time.sleep(3)

        after_count = (
            await session.execute(select(func.count(LLMUsageEvent.id)).where(LLMUsageEvent.user_id == user_id))
        ).scalar_one()
        if after_count <= before_count:
            raise RuntimeError(f"expected usage_events to increase, before={before_count} after={after_count}")

        await llm_key_service.revoke_my_key(db=session, user_id=user_id, key_id=key_id)

        litellm_base_url = os.getenv("LITELLM_BASE_URL", settings.LITELLM_BASE_URL).rstrip("/")
        resp2 = requests.post(
            f"{litellm_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {virtual_key}", "Content-Type": "application/json"},
            data=json.dumps(
                {
                    "model": "mock",
                    "messages": [{"role": "user", "content": "ping"}],
                    "stream": False,
                }
            ),
            timeout=30,
        )
        if resp2.status_code < 400:
            raise RuntimeError(f"expected revoked key to fail, got {resp2.status_code}: {resp2.text}")

    print(f"OK usage_events_before={before_count} usage_events_after={after_count}")


if __name__ == "__main__":
    asyncio.run(main())
