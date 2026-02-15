from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import Scene
from app.schemas_ai_scene_catalog import AISceneCatalogItem
from app.schemas_response import ResponseBase
from app.users import current_active_user


router = APIRouter()


def _read_scene(row: Scene) -> AISceneCatalogItem:
    builtin_code = None
    try:
        builtin_code = row.builtin_agent.agent_code if row.builtin_agent else None
    except Exception:
        builtin_code = None
    return AISceneCatalogItem(
        scene_code=row.scene_code,
        name=row.name,
        type=row.type,
        description=row.description,
        builtin_agent_code=builtin_code,
        required_tools=list(getattr(row, "required_tools", None) or []),
        input_schema=dict(getattr(row, "input_schema", None) or {}),
        output_schema=dict(getattr(row, "output_schema", None) or {}),
        ui_config=dict(getattr(row, "ui_config", None) or {}),
    )


@router.get("/ai/scenes", response_model=ResponseBase[list[AISceneCatalogItem]])
async def list_ai_scenes_catalog(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[list[AISceneCatalogItem]]:
    _ = user
    rows = (
        await db.execute(select(Scene).options(selectinload(Scene.builtin_agent)))
    ).scalars().all()
    data: list[AISceneCatalogItem] = []
    for r in rows:
        cfg = dict(getattr(r, "ui_config", None) or {})
        if cfg.get("is_active") is False:
            continue
        data.append(_read_scene(r))
    data.sort(key=lambda x: x.scene_code)
    return ResponseBase(code=200, msg="OK", data=data)

