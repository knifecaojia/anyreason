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
    # Handle project_id if present in task_data but not in model constructor
    # Assuming Task model might not have project_id yet or we need to pass it
    # Check if Task model has project_id column. If so, it should be in task_data.
    # If not, we might need to remove it or update the model.
    # Let's assume the user wants to add project_id support to tasks.
    # But first, let's just pass task_data as is, assuming keys match model columns.
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


async def list_task_events(
    *,
    db: AsyncSession,
    user_id: UUID,
    task_id: UUID,
    limit: int = 200,
    offset: int = 0,
    order: str = "asc",
) -> list[TaskEvent]:
    q = (
        select(TaskEvent)
        .join(Task, Task.id == TaskEvent.task_id)
        .where(TaskEvent.task_id == task_id, Task.user_id == user_id)
    )
    if order == "desc":
        q = q.order_by(desc(TaskEvent.created_at))
    else:
        q = q.order_by(TaskEvent.created_at.asc())
    q = q.offset(max(0, int(offset))).limit(max(1, min(500, int(limit))))
    rows = (await db.execute(q)).scalars().all()
    return list(rows)
