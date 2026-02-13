from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuiltinAgent, Scene
from app.scene_engine.scenes.script_split import ScriptSplitInput, ScriptSplitOutput, run_script_split


@dataclass(frozen=True)
class SceneInfo:
    scene_code: str
    name: str
    type: str
    description: str | None
    builtin_agent_code: str | None


SceneRunner = Callable[[AsyncSession, UUID, Any], BaseModel]


@dataclass(frozen=True)
class SceneDefinition:
    scene_code: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    run: Callable[..., BaseModel]


SCENE_DEFINITIONS: dict[str, SceneDefinition] = {
    "script_split": SceneDefinition(
        scene_code="script_split",
        input_model=ScriptSplitInput,
        output_model=ScriptSplitOutput,
        run=run_script_split,
    )
}


async def list_scenes(*, db: AsyncSession) -> list[SceneInfo]:
    rows = (await db.execute(select(Scene))).scalars().all()
    builtin_ids = [s.builtin_agent_id for s in rows if s.builtin_agent_id is not None]
    builtin_rows = []
    if builtin_ids:
        builtin_rows = (
            await db.execute(select(BuiltinAgent).where(BuiltinAgent.id.in_(builtin_ids)))
        ).scalars().all()
    builtin_by_id = {b.id: b for b in builtin_rows}

    out: list[SceneInfo] = []
    for s in rows:
        b = builtin_by_id.get(s.builtin_agent_id) if s.builtin_agent_id else None
        out.append(
            SceneInfo(
                scene_code=s.scene_code,
                name=s.name,
                type=s.type,
                description=s.description,
                builtin_agent_code=b.agent_code if b else None,
            )
        )
    out.sort(key=lambda x: x.scene_code)
    return out


async def run_scene(
    *,
    db: AsyncSession,
    user_id: UUID,
    scene_code: str,
    payload: dict[str, Any],
) -> BaseModel:
    definition = SCENE_DEFINITIONS.get(scene_code)
    if definition is None:
        raise ValueError("scene_not_found")
    input_obj = definition.input_model.model_validate(payload)
    return await definition.run(db=db, user_id=user_id, payload=input_obj)

