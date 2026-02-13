from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas_response import ResponseBase
from app.schemas_user_agents import UserAgentCreate, UserAgentRead, UserAgentUpdate
from app.services.user_agent_service import user_agent_service
from app.users import current_active_user


router = APIRouter(prefix="/user-agents")


@router.get("", response_model=ResponseBase[list[UserAgentRead]])
async def list_user_agents(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await user_agent_service.list_for_user(db=db, user_id=user.id)
    data = [UserAgentRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("", response_model=ResponseBase[UserAgentRead])
async def create_user_agent(
    payload: UserAgentCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_agent_service.create(
        db=db,
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        base_builtin_agent_id=payload.base_builtin_agent_id,
        system_prompt=payload.system_prompt,
        ai_model_config_id=payload.ai_model_config_id,
        temperature=payload.temperature,
        tools=payload.tools,
        is_public=payload.is_public,
    )
    return ResponseBase(code=201, msg="Created", data=UserAgentRead.model_validate(row))


@router.get("/{user_agent_id}", response_model=ResponseBase[UserAgentRead])
async def get_user_agent(
    user_agent_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_agent_service.get_for_user(db=db, user_id=user.id, user_agent_id=user_agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_agent_not_found")
    return ResponseBase(code=200, msg="OK", data=UserAgentRead.model_validate(row))


@router.put("/{user_agent_id}", response_model=ResponseBase[UserAgentRead])
async def update_user_agent(
    user_agent_id: UUID,
    payload: UserAgentUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_agent_service.get_for_user(db=db, user_id=user.id, user_agent_id=user_agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_agent_not_found")

    patch = payload.model_dump(exclude_unset=True)
    row = await user_agent_service.update(db=db, row=row, patch=patch)
    return ResponseBase(code=200, msg="OK", data=UserAgentRead.model_validate(row))


@router.delete("/{user_agent_id}", response_model=ResponseBase[dict])
async def delete_user_agent(
    user_agent_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = await user_agent_service.get_for_user(db=db, user_id=user.id, user_agent_id=user_agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user_agent_not_found")
    await user_agent_service.delete(db=db, row=row)
    return ResponseBase(code=200, msg="OK", data={"ok": True})

