from __future__ import annotations

import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai_scene_test.runner import run_scene_test_chat
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.database import User, get_async_session
from app.models import BuiltinAgent, BuiltinAgentPromptVersion, Scene
from app.schemas_ai_scene_test import AISceneTestAgentSelect, AISceneTestChatMessage, AISceneTestChatRequest
from app.schemas_response import ResponseBase
from app.users import current_active_user


router = APIRouter()


class AISceneRunChatRequest(BaseModel):
    project_id: UUID | None = Field(default=None)
    script_text: str = Field(default="")
    messages: list[AISceneTestChatMessage] = Field(default_factory=list)
    context_exclude_types: list[str] = Field(default_factory=list)


class AISceneRunChatResponse(BaseModel):
    output_text: str = Field(default="")
    plans: list[dict] = Field(default_factory=list)
    trace_events: list[dict] = Field(default_factory=list)
    archive: dict | None = Field(default=None)


async def _resolve_default_version(*, db: AsyncSession, agent_code: str) -> int:
    row = (
        await db.execute(
            select(BuiltinAgentPromptVersion.version)
            .join(BuiltinAgent, BuiltinAgentPromptVersion.builtin_agent_id == BuiltinAgent.id)
            .where(BuiltinAgent.agent_code == agent_code)
            .order_by(BuiltinAgentPromptVersion.is_default.desc(), BuiltinAgentPromptVersion.version.desc())
        )
    ).scalars().first()
    try:
        v = int(row or 0)
        return v if v > 0 else 1
    except Exception:
        return 1


def _tool_ids_for_scene(scene: Scene) -> list[str]:
    raw = list(getattr(scene, "required_tools", None) or [])
    allowed = set(TOOL_REGISTRY.keys())
    return [t for t in raw if t in allowed]


@router.post("/ai/scenes/{scene_code}/chat/stream")
async def ai_scene_chat_stream(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    row = (
        await db.execute(
            select(Scene)
            .where(Scene.scene_code == scene_code)
            .options(selectinload(Scene.builtin_agent))
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="scene_not_found")

    main_agent_code = None
    try:
        main_agent_code = row.builtin_agent.agent_code if row.builtin_agent else None
    except Exception:
        main_agent_code = None
    main_agent_code = (main_agent_code or "").strip() or "script_expert"
    main_version = await _resolve_default_version(db=db, agent_code=main_agent_code)

    tool_ids = _tool_ids_for_scene(row)
    uses_agent_codes: set[str] = set()
    for tid in tool_ids:
        reg = TOOL_REGISTRY.get(tid)
        if not reg:
            continue
        for c in reg[2] or []:
            if c:
                uses_agent_codes.add(str(c))

    sub_agents: list[AISceneTestAgentSelect] = []
    for agent_code in sorted(uses_agent_codes):
        v = await _resolve_default_version(db=db, agent_code=agent_code)
        sub_agents.append(AISceneTestAgentSelect(agent_code=agent_code, version=v))

    req = AISceneTestChatRequest(
        main_agent=AISceneTestAgentSelect(agent_code=main_agent_code, version=main_version),
        sub_agents=sub_agents,
        tool_ids=tool_ids,
        script_text=body.script_text or "",
        messages=list(body.messages or []),
        project_id=body.project_id,
        context_exclude_types=list(body.context_exclude_types or []),
    )

    trace_queue: asyncio.Queue = asyncio.Queue()

    async def iterator():
        yield f"data: {json.dumps({'type': 'start', 'scene_code': row.scene_code}, ensure_ascii=False)}\n\n".encode("utf-8")
        output_text = ""
        plans: list = []
        archive: dict | None = None
        last_sent_at = time.monotonic()

        async def run_in_background():
            nonlocal output_text, plans, archive
            output_text, plans, _trace, archive = await run_scene_test_chat(
                body=req,
                db=db,
                user_id=user.id,
                trace_queue=trace_queue,
            )

        task = asyncio.create_task(run_in_background())

        while True:
            if task.done() and trace_queue.empty():
                break
            try:
                evt = await asyncio.wait_for(trace_queue.get(), timeout=5.0)
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode("utf-8")
                last_sent_at = time.monotonic()
            except asyncio.TimeoutError:
                now = time.monotonic()
                if now - last_sent_at >= 10.0:
                    yield b": ping\n\n"
                    last_sent_at = now

        try:
            await task
        except Exception as e:
            msg = str(e) or "error"
            yield f"data: {json.dumps({'type': 'error', 'message': msg}, ensure_ascii=False)}\n\n".encode("utf-8")
            return

        chunk_size = 24
        for i in range(0, len(output_text), chunk_size):
            delta = output_text[i : i + chunk_size]
            yield f"data: {json.dumps({'type': 'delta', 'delta': delta}, ensure_ascii=False)}\n\n".encode("utf-8")
            await asyncio.sleep(0)

        yield f"data: {json.dumps({'type': 'plans', 'plans': [p.model_dump() for p in plans]}, ensure_ascii=False)}\n\n".encode("utf-8")
        if archive:
            yield f"data: {json.dumps({'type': 'archive', 'archive': archive}, ensure_ascii=False)}\n\n".encode("utf-8")
        yield f"data: {json.dumps({'type': 'done', 'output_text': output_text}, ensure_ascii=False)}\n\n".encode("utf-8")

    return StreamingResponse(
        iterator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/ai/scenes/{scene_code}/chat", response_model=ResponseBase[AISceneRunChatResponse])
async def ai_scene_chat(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AISceneRunChatResponse]:
    row = (
        await db.execute(
            select(Scene)
            .where(Scene.scene_code == scene_code)
            .options(selectinload(Scene.builtin_agent))
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="scene_not_found")

    main_agent_code = None
    try:
        main_agent_code = row.builtin_agent.agent_code if row.builtin_agent else None
    except Exception:
        main_agent_code = None
    main_agent_code = (main_agent_code or "").strip() or "script_expert"
    main_version = await _resolve_default_version(db=db, agent_code=main_agent_code)

    tool_ids = _tool_ids_for_scene(row)
    uses_agent_codes: set[str] = set()
    for tid in tool_ids:
        reg = TOOL_REGISTRY.get(tid)
        if not reg:
            continue
        for c in reg[2] or []:
            if c:
                uses_agent_codes.add(str(c))

    sub_agents: list[AISceneTestAgentSelect] = []
    for agent_code in sorted(uses_agent_codes):
        v = await _resolve_default_version(db=db, agent_code=agent_code)
        sub_agents.append(AISceneTestAgentSelect(agent_code=agent_code, version=v))

    req = AISceneTestChatRequest(
        main_agent=AISceneTestAgentSelect(agent_code=main_agent_code, version=main_version),
        sub_agents=sub_agents,
        tool_ids=tool_ids,
        script_text=body.script_text or "",
        messages=list(body.messages or []),
        project_id=body.project_id,
        context_exclude_types=list(body.context_exclude_types or []),
    )

    output_text, plans, trace_events, archive = await run_scene_test_chat(
        body=req,
        db=db,
        user_id=user.id,
        trace_queue=None,
    )
    return ResponseBase(
        code=200,
        msg="OK",
        data=AISceneRunChatResponse(
            output_text=output_text,
            plans=[p.model_dump() for p in plans],
            trace_events=list(trace_events or []),
            archive=archive,
        ),
    )
