from __future__ import annotations

import asyncio
from uuid import UUID

from app.celery_app import get_celery_app
from app.tasks.process_task import process_task


celery_app = get_celery_app()


@celery_app.task(name="anyreason.execute_task")
def execute_task(task_id: str) -> None:
    asyncio.run(process_task(task_id=UUID(task_id)))

