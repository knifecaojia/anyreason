from __future__ import annotations

import os
import json
from uuid import UUID

from app.config import settings
from app.tasks.redis_client import get_redis


async def enqueue_task(*, task_id: UUID) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    r = get_redis()
    await r.lpush(settings.TASK_QUEUE_KEY, str(task_id))


async def publish_task_event(*, payload: dict) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    r = get_redis()
    await r.publish(
        settings.TASK_EVENTS_CHANNEL,
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )
