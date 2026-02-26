from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import TaskCreateRequest, TaskEventRead, TaskRead, TaskWsTicketRead
from app.schemas_response import ResponseBase
from app.services.task_service import task_service
from app.tasks.ticket import issue_ws_ticket
from app.users import current_active_user


router = APIRouter()


@router.post("/ws-ticket", response_model=ResponseBase[TaskWsTicketRead])
async def issue_task_ws_ticket(
    user: User = Depends(current_active_user),
):
    issued = issue_ws_ticket(user_id=user.id, secret=settings.ACCESS_SECRET_KEY, ttl_seconds=600)
    return ResponseBase(
        code=200,
        msg="OK",
        data=TaskWsTicketRead(
            ticket=issued.ticket,
            expires_at=datetime.fromtimestamp(issued.expires_at_epoch, tz=timezone.utc),
        ),
    )


@router.post("/", response_model=ResponseBase[TaskRead])
async def create_task(
    payload: TaskCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.create_task(db=db, user_id=user.id, payload=payload)
    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))


@router.get("/{task_id}", response_model=ResponseBase[TaskRead])
async def get_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.get_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))


@router.get("/", response_model=ResponseBase[Page[TaskRead]])
async def list_tasks(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    status: str | None = Query(None, description="Comma-separated statuses"),
    type: str | None = Query(None, description="Task type filter"),
    entity_type: str | None = Query(None),
    entity_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
):
    params = Params(page=page, size=size)
    statuses = None
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
    data = await task_service.list_tasks(
        db=db,
        user_id=user.id,
        params=params,
        statuses=statuses,
        entity_type=entity_type,
        entity_id=entity_id,
        task_type=type,
    )
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/{task_id}/cancel", response_model=ResponseBase[TaskRead])
async def cancel_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.cancel_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))


@router.post("/{task_id}/retry", response_model=ResponseBase[TaskRead])
async def retry_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.retry_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))


@router.get("/{task_id}/events", response_model=ResponseBase[list[TaskEventRead]])
async def list_task_events(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    order: str = Query("asc", pattern="^(asc|desc)$"),
):
    task = await task_service.get_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    events = await task_service.list_task_events(db=db, user_id=user.id, task_id=task_id, limit=limit, offset=offset, order=order)
    return ResponseBase(code=200, msg="OK", data=[TaskEventRead.model_validate(e) for e in events])
