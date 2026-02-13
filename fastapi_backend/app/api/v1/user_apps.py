from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas import TaskCreateRequest, TaskRead
from app.schemas_response import ResponseBase
from app.schemas_user_apps import UserAppCreate, UserAppRead, UserAppRunRequest, UserAppUpdate
from app.services.app_runtime_service import validate_flow_definition
from app.services.task_service import task_service
from app.services.user_app_service import user_app_service
from app.users import current_active_user


router = APIRouter(prefix="/user-apps")


@router.get("", response_model=ResponseBase[list[UserAppRead]])
async def list_user_apps(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await user_app_service.list_for_user(db=db, user_id=user.id)
    data = [UserAppRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("", response_model=ResponseBase[UserAppRead])
async def create_user_app(
    payload: UserAppCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    try:
        validate_flow_definition(payload.flow_definition)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_flow_definition")

    row = await user_app_service.create(
        db=db,
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        flow_definition=payload.flow_definition,
        trigger_type=payload.trigger_type,
        input_template=payload.input_template,
        output_template=payload.output_template,
        is_active=payload.is_active,
    )
    return ResponseBase(code=201, msg="Created", data=UserAppRead.model_validate(row))


@router.get("/{app_id}", response_model=ResponseBase[UserAppRead])
async def get_user_app(
    app_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_app_service.get_for_user(db=db, user_id=user.id, app_id=app_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_app_not_found")
    return ResponseBase(code=200, msg="OK", data=UserAppRead.model_validate(row))


@router.put("/{app_id}", response_model=ResponseBase[UserAppRead])
async def update_user_app(
    app_id: UUID,
    payload: UserAppUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_app_service.get_for_user(db=db, user_id=user.id, app_id=app_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_app_not_found")

    patch = payload.model_dump(exclude_unset=True)
    if "flow_definition" in patch:
        try:
            validate_flow_definition(patch["flow_definition"] or {})
        except Exception:
            raise HTTPException(status_code=400, detail="invalid_flow_definition")

    row = await user_app_service.update(db=db, row=row, patch=patch)
    return ResponseBase(code=200, msg="OK", data=UserAppRead.model_validate(row))


@router.delete("/{app_id}", response_model=ResponseBase[dict])
async def delete_user_app(
    app_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_app_service.get_for_user(db=db, user_id=user.id, app_id=app_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_app_not_found")
    await user_app_service.delete(db=db, row=row)
    return ResponseBase(code=200, msg="OK", data={"ok": True})


@router.post("/{app_id}/run", response_model=ResponseBase[TaskRead])
async def run_user_app(
    app_id: UUID,
    payload: UserAppRunRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_app_service.get_for_user(db=db, user_id=user.id, app_id=app_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_app_not_found")
    if not row.is_active:
        raise HTTPException(status_code=400, detail="user_app_inactive")

    task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="user_app_run",
            entity_type="user_app",
            entity_id=row.id,
            input_json={"app_id": str(row.id), "input_data": payload.input_data},
        ),
    )
    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))

