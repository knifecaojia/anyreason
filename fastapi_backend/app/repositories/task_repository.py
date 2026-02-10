from __future__ import annotations

from uuid import UUID

from fastapi_pagination import Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskEvent
from app.schemas import TaskRead


def _transform_tasks(items):
    return [TaskRead.model_validate(item) for item in items]


async def create_task(*, db: AsyncSession, user_id: UUID, task_data: dict) -> Task:
    row = Task(**task_data, user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_user_task(*, db: AsyncSession, user_id: UUID, task_id: UUID) -> Task | None:
    res = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    return res.scalars().first()


async def list_user_tasks(
    *,
    db: AsyncSession,
    user_id: UUID,
    params: Params,
    statuses: list[str] | None = None,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
):
    query = select(Task).where(Task.user_id == user_id).order_by(desc(Task.created_at))
    if statuses:
        query = query.where(Task.status.in_(statuses))
    if entity_type:
        query = query.where(Task.entity_type == entity_type)
    if entity_id:
        query = query.where(Task.entity_id == entity_id)
    return await apaginate(db, query, params, transformer=_transform_tasks)


async def update_task(*, db: AsyncSession, task: Task) -> Task:
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def create_task_event(*, db: AsyncSession, task_id: UUID, event_type: str, payload: dict) -> TaskEvent:
    row = TaskEvent(task_id=task_id, event_type=event_type, payload=payload)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
