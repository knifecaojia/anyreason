from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.audit import write_audit_log
from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Agent
from app.rbac import require_permissions
from app.schemas_agents import (
    AgentCreateRequest,
    AgentListRead,
    AgentPromptDiffResponse,
    AgentPromptVersionCreate,
    AgentPromptVersionRead,
    AgentPromptVersionUpdate,
    AgentRead,
    AgentRunRequest,
    AgentRunResponse,
    AgentUpdateRequest,
)
from app.schemas_response import ResponseBase
from app.services.agent_prompt_version_service import agent_prompt_version_service
from app.services.agent_service import agent_service
from app.users import current_active_user


router = APIRouter(prefix="/agents")


@router.get("", response_model=ResponseBase[list[AgentListRead]])
async def list_agents(
    capability: str | None = Query(None),
    purpose: str | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[list[AgentListRead]]:
    _ = user
    q = select(Agent).where(Agent.enabled.is_(True), Agent.category == "text").order_by(Agent.name.asc())
    cap = (capability or "").strip()
    if cap:
        q = q.where(Agent.capabilities.contains([cap]))
    p = (purpose or "").strip()
    if p:
        q = q.where(Agent.purpose == p)
    rows = (await db.execute(q)).scalars().all()
    return ResponseBase(code=200, msg="OK", data=[AgentListRead.model_validate(r) for r in rows])


@router.get(
    "/admin",
    response_model=ResponseBase[list[AgentRead]],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_list_agents(
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AgentRead]]:
    rows = await agent_service.list_admin(db=db)
    return ResponseBase(code=200, msg="OK", data=[AgentRead.model_validate(r) for r in rows])


@router.post(
    "/admin",
    response_model=ResponseBase[AgentRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_create_agent(
    request: Request,
    body: AgentCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[AgentRead]:
    row = await agent_service.create(
        db=db,
        name=body.name,
        category=body.category,
        purpose=body.purpose,
        ai_model_config_id=body.ai_model_config_id,
        capabilities=body.capabilities,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        credits_per_call=body.credits_per_call,
        enabled=body.enabled,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.create",
        resource_type="agent",
        resource_id=row.id,
        meta={
            "name": row.name,
            "category": row.category,
            "purpose": row.purpose,
            "ai_model_config_id": str(row.ai_model_config_id),
        },
    )
    return ResponseBase(code=200, msg="OK", data=AgentRead.model_validate(row))


@router.put(
    "/admin/{agent_id}",
    response_model=ResponseBase[AgentRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_update_agent(
    request: Request,
    agent_id: UUID,
    body: AgentUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[AgentRead]:
    row = await agent_service.update(db=db, agent_id=agent_id, patch=body.model_dump(exclude_unset=True))
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.update",
        resource_type="agent",
        resource_id=row.id,
        meta={"agent_id": str(row.id)},
    )
    return ResponseBase(code=200, msg="OK", data=AgentRead.model_validate(row))

@router.delete(
    "/admin/{agent_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_delete_agent(
    request: Request,
    agent_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[dict]:
    await agent_service.delete(db=db, agent_id=agent_id)
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.delete",
        resource_type="agent",
        resource_id=agent_id,
        meta={"agent_id": str(agent_id)},
    )
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.post("/{agent_id}/run", response_model=ResponseBase[AgentRunResponse])
async def run_agent(
    agent_id: UUID,
    body: AgentRunRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AgentRunResponse]:
    input_text = (body.input_text or "").strip()
    variables = dict(body.variables or {})
    output_text, raw = await agent_service.run_text_agent(
        db=db,
        user_id=user.id,
        agent_id=agent_id,
        input_text=input_text,
        variables=variables,
    )

    return ResponseBase(code=200, msg="OK", data=AgentRunResponse(output_text=str(output_text), raw=raw))


@router.get(
    "/admin/{agent_id}/prompt-versions",
    response_model=ResponseBase[list[AgentPromptVersionRead]],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_list_agent_prompt_versions(
    agent_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AgentPromptVersionRead]]:
    rows = await agent_prompt_version_service.list_versions(db=db, agent_id=agent_id)
    return ResponseBase(code=200, msg="OK", data=[AgentPromptVersionRead.model_validate(r) for r in rows])


@router.post(
    "/admin/{agent_id}/prompt-versions",
    response_model=ResponseBase[AgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_create_agent_prompt_version(
    request: Request,
    agent_id: UUID,
    body: AgentPromptVersionCreate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[AgentPromptVersionRead]:
    row = await agent_prompt_version_service.create_version(
        db=db,
        agent_id=agent_id,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        description=body.description,
        meta=body.meta,
        created_by=actor.id,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.prompt_version.create",
        resource_type="agent",
        resource_id=agent_id,
        meta={"agent_id": str(agent_id), "version": row.version},
    )
    return ResponseBase(code=200, msg="OK", data=AgentPromptVersionRead.model_validate(row))


@router.put(
    "/admin/{agent_id}/prompt-versions/{version}",
    response_model=ResponseBase[AgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_update_agent_prompt_version(
    request: Request,
    agent_id: UUID,
    version: int,
    body: AgentPromptVersionUpdate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[AgentPromptVersionRead]:
    try:
        row = await agent_prompt_version_service.update_version(
            db=db,
            agent_id=agent_id,
            version=version,
            system_prompt=body.system_prompt,
            user_prompt_template=body.user_prompt_template,
            description=body.description,
            meta=body.meta,
        )
    except ValueError as e:
        raise AppError(str(e))
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.prompt_version.update",
        resource_type="agent",
        resource_id=agent_id,
        meta={"agent_id": str(agent_id), "version": version},
    )
    return ResponseBase(code=200, msg="OK", data=AgentPromptVersionRead.model_validate(row))


@router.delete(
    "/admin/{agent_id}/prompt-versions/{version}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_delete_agent_prompt_version(
    request: Request,
    agent_id: UUID,
    version: int,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[dict]:
    try:
        await agent_prompt_version_service.delete_version(db=db, agent_id=agent_id, version=version)
    except ValueError as e:
        raise AppError(str(e))
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.prompt_version.delete",
        resource_type="agent",
        resource_id=agent_id,
        meta={"agent_id": str(agent_id), "version": version},
    )
    return ResponseBase(code=200, msg="OK", data={"ok": True})


@router.post(
    "/admin/{agent_id}/prompt-versions/{version}/activate",
    response_model=ResponseBase[AgentPromptVersionRead],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_activate_agent_prompt_version(
    request: Request,
    agent_id: UUID,
    version: int,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.agents"])),
) -> ResponseBase[AgentPromptVersionRead]:
    try:
        row = await agent_prompt_version_service.activate_version(db=db, agent_id=agent_id, version=version)
    except ValueError as e:
        raise AppError(str(e))
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="agent.prompt_version.activate",
        resource_type="agent",
        resource_id=agent_id,
        meta={"agent_id": str(agent_id), "version": version},
    )
    return ResponseBase(code=200, msg="OK", data=AgentPromptVersionRead.model_validate(row))


@router.get(
    "/admin/{agent_id}/prompt-versions/diff",
    response_model=ResponseBase[AgentPromptDiffResponse],
    dependencies=[Depends(require_permissions(["system.agents"]))],
)
async def admin_diff_agent_prompt_versions(
    agent_id: UUID,
    from_version: int,
    to_version: int,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[AgentPromptDiffResponse]:
    try:
        diff = await agent_prompt_version_service.diff_versions(
            db=db, agent_id=agent_id, from_version=from_version, to_version=to_version
        )
    except ValueError as e:
        raise AppError(str(e))
    return ResponseBase(code=200, msg="OK", data=AgentPromptDiffResponse(diff=diff))
