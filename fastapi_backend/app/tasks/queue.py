from __future__ import annotations

import asyncio
import os
import json
from uuid import UUID

from app.config import settings
from app.tasks.redis_client import get_redis


async def enqueue_task(*, task_id: UUID) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    executor = (os.getenv("TASK_EXECUTOR") or "redis").strip().lower()
    if executor == "celery":
        from app.tasks.celery_tasks import execute_task

        execute_task.delay(str(task_id))
        return
    if executor == "inline":
        from app.tasks.process_task import process_task

        asyncio.create_task(process_task(task_id=task_id))
        return
    r = get_redis()
    try:
        await asyncio.wait_for(r.lpush(settings.TASK_QUEUE_KEY, str(task_id)), timeout=2.0)
    except Exception:
        from app.tasks.process_task import process_task

        asyncio.create_task(process_task(task_id=task_id))


async def publish_task_event(*, payload: dict) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    r = get_redis()
    try:
        await asyncio.wait_for(
            r.publish(
                settings.TASK_EVENTS_CHANNEL,
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            ),
            timeout=2.0,
        )
    except Exception:
        return
