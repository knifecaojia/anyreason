from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.tasks.reporter import TaskReporter


class BaseTaskHandler:
    task_type: str

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        raise NotImplementedError()
