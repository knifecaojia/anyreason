from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi_pagination import Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import task_repository
from app.schemas import TaskCreateRequest
from app.tasks.queue import enqueue_task


class TaskService:
    async def create_task(self, *, db: AsyncSession, user_id: UUID, payload: TaskCreateRequest):
        task_type = (payload.type or "").strip()
        entity_type = (payload.entity_type or "").strip() or None
        task = await task_repository.create_task(
            db=db,
            user_id=user_id,
            task_data={
                "type": task_type,
                "entity_type": entity_type,
                "entity_id": payload.entity_id,
                "input_json": payload.input_json,
            },
        )
        await task_repository.create_task_event(
            db=db, task_id=task.id, event_type="created", payload={"status": task.status}
        )
        await enqueue_task(task_id=task.id)
        return task

    async def get_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        return await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)

    async def list_tasks(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        params: Params,
        statuses: list[str] | None,
        entity_type: str | None,
        entity_id: UUID | None,
    ):
        return await task_repository.list_user_tasks(
            db=db,
            user_id=user_id,
            params=params,
            statuses=statuses,
            entity_type=entity_type,
            entity_id=entity_id,
        )

    async def cancel_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        task = await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)
        if task is None:
            return None
        if task.status in {"succeeded", "failed", "canceled"}:
            return task
        task.status = "canceled"
        task.finished_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        task = await task_repository.update_task(db=db, task=task)
        await task_repository.create_task_event(
            db=db, task_id=task.id, event_type="canceled", payload={"status": task.status}
        )
        return task

    async def retry_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        task = await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)
        if task is None:
            return None
        if task.status not in {"failed", "canceled"}:
            return task
        task.status = "queued"
        task.progress = 0
        task.error = None
        task.result_json = {}
        task.started_at = None
        task.finished_at = None
        task.updated_at = datetime.now(timezone.utc)
        task = await task_repository.update_task(db=db, task=task)
        await task_repository.create_task_event(
            db=db, task_id=task.id, event_type="retried", payload={"status": task.status}
        )
        await enqueue_task(task_id=task.id)
        return task


task_service = TaskService()
