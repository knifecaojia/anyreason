from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.rbac import require_permissions
from app.schemas_builtin_agents import (
    BuiltinAgentUpdate,
    BuiltinAgentOverrideUserVersionRequest,
    BuiltinAgentPromptDiffResponse,
    BuiltinAgentPromptVersionCreate,
    BuiltinAgentPromptVersionRead,
    BuiltinAgentPromptVersionUpdate,
    BuiltinAgentRead,
)
from app.schemas_response import ResponseBase
from app.services.builtin_agent_version_service import builtin_agent_version_service
from app.users import current_active_user


router = APIRouter(prefix="/admin/builtin-agents")


@router.get("", response_model=ResponseBase[list[BuiltinAgentRead]], dependencies=[Depends(require_permissions(["system.agents"]))])
async def list_builtin_agents(
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    rows = await builtin_agent_version_service.list_builtin_agents(db=db)
    data = [BuiltinAgentRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.put(
    "/{agent_code}",
    response_model=ResponseBase[BuiltinAgentRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def update_builtin_agent(
    agent_code: str,
    payload: BuiltinAgentUpdate,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    row = await builtin_agent_version_service.update_builtin_agent_default_model(
        db=db,
        agent_id=agent.id,
        default_ai_model_config_id=payload.default_ai_model_config_id,
    )
    return ResponseBase(code=200, msg="OK", data=BuiltinAgentRead.model_validate(row))


@router.get(
    "/{agent_code}/versions",
    response_model=ResponseBase[list[BuiltinAgentPromptVersionRead]],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def list_builtin_agent_versions(
    agent_code: str,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    rows = await builtin_agent_version_service.list_versions(db=db, agent_id=agent.id)
    data = [BuiltinAgentPromptVersionRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post(
    "/{agent_code}/versions",
    response_model=ResponseBase[BuiltinAgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def create_builtin_agent_version(
    agent_code: str,
    payload: BuiltinAgentPromptVersionCreate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    row = await builtin_agent_version_service.create_version(
        db=db,
        agent_id=agent.id,
        system_prompt=payload.system_prompt,
        ai_model_config_id=payload.ai_model_config_id,
        description=payload.description,
        meta=payload.meta,
        created_by=actor.id,
    )
    return ResponseBase(code=201, msg="Created", data=BuiltinAgentPromptVersionRead.model_validate(row))


@router.put(
    "/{agent_code}/versions/{version}",
    response_model=ResponseBase[BuiltinAgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def update_builtin_agent_version(
    agent_code: str,
    version: int,
    payload: BuiltinAgentPromptVersionUpdate,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    try:
        row = await builtin_agent_version_service.update_version(
            db=db,
            agent_id=agent.id,
            version=version,
            system_prompt=payload.system_prompt,
            ai_model_config_id=payload.ai_model_config_id,
            ai_model_config_id_set=("ai_model_config_id" in payload.model_fields_set),
            description=payload.description,
            meta=payload.meta,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ResponseBase(code=200, msg="OK", data=BuiltinAgentPromptVersionRead.model_validate(row))


@router.delete(
    "/{agent_code}/versions/{version}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def delete_builtin_agent_version(
    agent_code: str,
    version: int,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    try:
        await builtin_agent_version_service.delete_version(db=db, agent_id=agent.id, version=version)
    except ValueError as e:
        detail = str(e)
        raise HTTPException(status_code=404 if detail == "version_not_found" else 400, detail=detail)
    return ResponseBase(code=200, msg="OK", data={"ok": True})


@router.post(
    "/{agent_code}/versions/{version}/activate",
    response_model=ResponseBase[BuiltinAgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def activate_builtin_agent_version(
    agent_code: str,
    version: int,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    try:
        row = await builtin_agent_version_service.activate_version(db=db, agent_id=agent.id, version=version)
    except ValueError:
        raise HTTPException(status_code=404, detail="version_not_found")
    return ResponseBase(code=200, msg="OK", data=BuiltinAgentPromptVersionRead.model_validate(row))


@router.post(
    "/{agent_code}/override-user-version",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def override_user_version(
    agent_code: str,
    payload: BuiltinAgentOverrideUserVersionRequest,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    await builtin_agent_version_service.override_user_version(
        db=db,
        agent_id=agent.id,
        user_id=payload.user_id,
        version=payload.version,
    )
    return ResponseBase(code=200, msg="OK", data={"ok": True})


@router.get(
    "/{agent_code}/versions/diff",
    response_model=ResponseBase[BuiltinAgentPromptDiffResponse],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def diff_builtin_agent_versions(
    agent_code: str,
    from_version: int,
    to_version: int,
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
):
    agent = await builtin_agent_version_service.get_builtin_agent(db=db, agent_code=agent_code)
    if agent is None:
        raise HTTPException(status_code=404, detail="builtin_agent_not_found")
    try:
        diff = await builtin_agent_version_service.diff_versions(
            db=db,
            agent_id=agent.id,
            from_version=from_version,
            to_version=to_version,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="version_not_found")
    return ResponseBase(code=200, msg="OK", data=BuiltinAgentPromptDiffResponse(diff=diff))
