from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import BuiltinAgent, Scene
from app.rbac import require_permissions
from app.schemas_ai_scenes import AdminAISceneCreateRequest, AdminAISceneRead, AdminAISceneUpdateRequest
from app.schemas_response import ResponseBase
from app.scene_engine.registry import SCENE_DEFINITIONS


router = APIRouter()


def _effective_schema(scene_code: str) -> tuple[dict, dict, bool]:
    d = SCENE_DEFINITIONS.get(scene_code)
    if d is None:
        return {}, {}, False
    try:
        return d.input_model.model_json_schema(), d.output_model.model_json_schema(), True
    except Exception:
        return {}, {}, True


def _read(row: Scene) -> AdminAISceneRead:
    builtin_code = None
    try:
        builtin_code = row.builtin_agent.agent_code if row.builtin_agent else None
    except Exception:
        builtin_code = None

    effective_in, effective_out, runnable = _effective_schema(row.scene_code)
    return AdminAISceneRead(
        scene_code=row.scene_code,
        name=row.name,
        type=row.type,
        description=row.description,
        builtin_agent_code=builtin_code,
        required_tools=list(getattr(row, "required_tools", None) or []),
        input_schema=dict(getattr(row, "input_schema", None) or {}),
        output_schema=dict(getattr(row, "output_schema", None) or {}),
        ui_config=dict(getattr(row, "ui_config", None) or {}),
        effective_input_schema=effective_in,
        effective_output_schema=effective_out,
        is_runnable=bool(runnable),
        created_at=row.created_at.isoformat() if getattr(row, "created_at", None) else None,
        updated_at=row.updated_at.isoformat() if getattr(row, "updated_at", None) else None,
    )


@router.get(
    "/ai/admin/scenes",
    response_model=ResponseBase[list[AdminAISceneRead]],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_list_ai_scenes(
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AdminAISceneRead]]:
    rows = (
        await db.execute(select(Scene).options(selectinload(Scene.builtin_agent)))
    ).scalars().all()
    data = [_read(r) for r in rows]
    data.sort(key=lambda x: x.scene_code)
    return ResponseBase(code=200, msg="OK", data=data)


@router.post(
    "/ai/admin/scenes",
    response_model=ResponseBase[AdminAISceneRead],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_create_ai_scene(
    request: Request,
    body: AdminAISceneCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_scenes"])),
) -> ResponseBase[AdminAISceneRead]:
    _ = (request, actor)
    exists = (
        await db.execute(select(Scene).where(Scene.scene_code == body.scene_code))
    ).scalars().first()
    if exists is not None:
        return ResponseBase(code=409, msg="scene_code_exists", data=_read(exists))

    builtin_agent_id = None
    if body.builtin_agent_code:
        a = (
            await db.execute(select(BuiltinAgent).where(BuiltinAgent.agent_code == body.builtin_agent_code))
        ).scalars().first()
        if a is not None:
            builtin_agent_id = a.id

    row = Scene(
        scene_code=body.scene_code,
        name=body.name,
        type=body.type,
        description=body.description,
        builtin_agent_id=builtin_agent_id,
        required_tools=list(body.required_tools or []),
        input_schema=dict(body.input_schema or {}),
        output_schema=dict(body.output_schema or {}),
        ui_config=dict(body.ui_config or {}),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResponseBase(code=200, msg="OK", data=_read(row))


@router.patch(
    "/ai/admin/scenes/{scene_code}",
    response_model=ResponseBase[AdminAISceneRead],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_update_ai_scene(
    scene_code: str,
    body: AdminAISceneUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_scenes"])),
) -> ResponseBase[AdminAISceneRead]:
    _ = actor
    row = (
        await db.execute(select(Scene).where(Scene.scene_code == scene_code).options(selectinload(Scene.builtin_agent)))
    ).scalars().first()
    if row is None:
        return ResponseBase(code=404, msg="scene_not_found", data=None)

    patch = body.model_dump(exclude_unset=True)

    if "builtin_agent_code" in patch:
        code = (patch.pop("builtin_agent_code") or "").strip()
        if not code:
            row.builtin_agent_id = None
        else:
            a = (await db.execute(select(BuiltinAgent).where(BuiltinAgent.agent_code == code))).scalars().first()
            row.builtin_agent_id = a.id if a is not None else None

    if "name" in patch and patch["name"] is not None:
        row.name = str(patch["name"])
    if "type" in patch and patch["type"] is not None:
        row.type = str(patch["type"])
    if "description" in patch:
        row.description = patch.get("description")
    if "required_tools" in patch and patch["required_tools"] is not None:
        row.required_tools = list(patch["required_tools"] or [])
    if "input_schema" in patch and patch["input_schema"] is not None:
        row.input_schema = dict(patch["input_schema"] or {})
    if "output_schema" in patch and patch["output_schema"] is not None:
        row.output_schema = dict(patch["output_schema"] or {})
    if "ui_config" in patch and patch["ui_config"] is not None:
        row.ui_config = dict(patch["ui_config"] or {})

    await db.commit()
    await db.refresh(row)
    return ResponseBase(code=200, msg="OK", data=_read(row))


@router.delete(
    "/ai/admin/scenes/{scene_code}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_delete_ai_scene(
    scene_code: str,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_scenes"])),
) -> ResponseBase[dict]:
    _ = actor
    row = (await db.execute(select(Scene).where(Scene.scene_code == scene_code))).scalars().first()
    if row is None:
        return ResponseBase(code=404, msg="scene_not_found", data={"deleted": False})
    await db.delete(row)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})

