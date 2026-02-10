from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class NoopTaskHandler(BaseTaskHandler):
    task_type = "noop"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        _ = db
        _ = task
        await reporter.progress(progress=10)
        await asyncio.sleep(0.1)
        await reporter.progress(progress=60)
        await asyncio.sleep(0.1)
        await reporter.progress(progress=90)
        return {"ok": True}
