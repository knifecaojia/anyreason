from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.repositories import task_repository
from app.tasks.queue import publish_task_event


class TaskReporter:
    def __init__(self, *, db: AsyncSession, task: Task):
        self._db = db
        self._task = task

    @property
    def task(self) -> Task:
        return self._task

    async def set_running(self) -> None:
        now = datetime.now(timezone.utc)
        self._task.status = "running"
        self._task.started_at = self._task.started_at or now
        self._task.updated_at = now
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=self._task.id,
            event_type="running",
            payload={"status": self._task.status, "progress": int(self._task.progress or 0)},
        )
        await publish_task_event(
            payload={
                "user_id": str(self._task.user_id),
                "task_id": str(self._task.id),
                "event_type": "running",
                "status": self._task.status,
                "progress": int(self._task.progress or 0),
            }
        )

    async def progress(self, *, progress: int, payload: dict[str, Any] | None = None) -> None:
        now = datetime.now(timezone.utc)
        self._task.progress = max(0, min(100, int(progress)))
        self._task.updated_at = now
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        data = {"status": self._task.status, "progress": int(self._task.progress)}
        if payload:
            data.update(payload)
        await task_repository.create_task_event(
            db=self._db,
            task_id=self._task.id,
            event_type="progress",
            payload=data,
        )
        await publish_task_event(
            payload={
                "user_id": str(self._task.user_id),
                "task_id": str(self._task.id),
                "event_type": "progress",
                "status": self._task.status,
                "progress": int(self._task.progress),
                "payload": payload or {},
            }
        )

    async def succeed(self, *, result_json: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc)
        self._task.status = "succeeded"
        self._task.progress = 100
        self._task.result_json = result_json or {}
        self._task.error = None
        self._task.finished_at = now
        self._task.updated_at = now
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=self._task.id,
            event_type="succeeded",
            payload={"status": self._task.status, "progress": 100},
        )
        await publish_task_event(
            payload={
                "user_id": str(self._task.user_id),
                "task_id": str(self._task.id),
                "event_type": "succeeded",
                "status": self._task.status,
                "progress": 100,
            }
        )

    async def fail(self, *, error: str) -> None:
        now = datetime.now(timezone.utc)
        self._task.status = "failed"
        self._task.error = (error or "").strip() or "Task failed"
        self._task.finished_at = now
        self._task.updated_at = now
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=self._task.id,
            event_type="failed",
            payload={"status": self._task.status, "error": self._task.error},
        )
        await publish_task_event(
            payload={
                "user_id": str(self._task.user_id),
                "task_id": str(self._task.id),
                "event_type": "failed",
                "status": self._task.status,
                "error": self._task.error,
            }
        )
