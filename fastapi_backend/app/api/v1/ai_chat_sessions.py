from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai_scene_test.runner import run_scene_test_chat
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.database import User, get_async_session
from app.models import BuiltinAgent, BuiltinAgentPromptVersion, Episode, Scene
from app.schemas_ai_chat import (
    AIChatMessageCreate,
    AIChatMessageRead,
    AIChatSessionCreate,
    AIChatSessionListItem,
    AIChatSessionListResponse,
    AIChatSessionRead,
    AIChatSessionUpdate,
)
from app.schemas_ai_scene_test import AISceneTestAgentSelect, AISceneTestChatMessage, AISceneTestChatRequest
from app.schemas_response import ResponseBase
from app.services.ai_chat_session_service import ai_chat_session_service
from app.users import current_active_user


router = APIRouter()


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


@router.get("/ai/chat/sessions", response_model=ResponseBase[AIChatSessionListResponse])
async def list_sessions(
    project_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AIChatSessionListResponse]:
    sessions, total = await ai_chat_session_service.list_sessions(
        db=db,
        user_id=user.id,
        project_id=project_id,
        page=page,
        page_size=page_size,
    )
    items = []
    for s in sessions:
        msg_count = len(s.messages) if hasattr(s, "messages") and s.messages else 0
        items.append(AIChatSessionListItem(
            id=s.id,
            title=s.title,
            scene_code=s.scene_code,
            created_at=s.created_at,
            updated_at=s.updated_at,
            message_count=msg_count,
        ))
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIChatSessionListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        ),
    )


@router.post("/ai/chat/sessions", response_model=ResponseBase[AIChatSessionRead])
async def create_session(
    body: AIChatSessionCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AIChatSessionRead]:
    session = await ai_chat_session_service.create_session(
        db=db,
        user_id=user.id,
        scene_code=body.scene_code,
        project_id=body.project_id,
        title=body.title,
    )
    await db.commit()
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIChatSessionRead(
            id=session.id,
            user_id=session.user_id,
            project_id=session.project_id,
            title=session.title,
            scene_code=session.scene_code,
            created_at=session.created_at,
            updated_at=session.updated_at,
            messages=[],
        ),
    )


@router.get("/ai/chat/sessions/{session_id}", response_model=ResponseBase[AIChatSessionRead])
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AIChatSessionRead]:
    session = await ai_chat_session_service.get_session(
        db=db,
        user_id=user.id,
        session_id=session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIChatSessionRead.model_validate(session),
    )


@router.patch("/ai/chat/sessions/{session_id}", response_model=ResponseBase[AIChatSessionRead])
async def update_session(
    session_id: UUID,
    body: AIChatSessionUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AIChatSessionRead]:
    session = await ai_chat_session_service.update_session(
        db=db,
        user_id=user.id,
        session_id=session_id,
        title=body.title,
    )
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    await db.commit()
    await db.refresh(session)
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIChatSessionRead.model_validate(session),
    )


@router.delete("/ai/chat/sessions/{session_id}")
async def delete_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[dict]:
    success = await ai_chat_session_service.delete_session(
        db=db,
        user_id=user.id,
        session_id=session_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="session_not_found")
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.post("/ai/chat/sessions/{session_id}/messages")
async def send_message(
    session_id: UUID,
    body: AIChatMessageCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await ai_chat_session_service.get_session(
        db=db,
        user_id=user.id,
        session_id=session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")

    scene_code = body.scene_code or session.scene_code
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

    history_messages = [
        AISceneTestChatMessage(role=m.role, content=m.content)
        for m in session.messages
    ]
    history_messages.append(AISceneTestChatMessage(role="user", content=body.content))

    script_text = ""
    if session.project_id:
        if body.episode_id:
            ep_row = (
                await db.execute(
                    select(Episode.script_full_text, Episode.episode_number, Episode.title)
                    .where(Episode.id == body.episode_id)
                    .where(Episode.project_id == session.project_id)
                )
            ).first()
            if ep_row and ep_row[0]:
                script_text = f"[第{ep_row[1]}集{f' - {ep_row[2]}' if ep_row[2] else ''}]\n\n{ep_row[0]}"
        else:
            ep_rows = (
                await db.execute(
                    select(Episode.script_full_text, Episode.episode_number, Episode.title)
                    .where(Episode.project_id == session.project_id)
                    .where(Episode.script_full_text.isnot(None))
                    .order_by(Episode.episode_number)
                )
            ).all()
            script_text = "\n\n".join([
                f"[第{r[1]}集{f' - {r[2]}' if r[2] else ''}]\n\n{r[0]}"
                for r in ep_rows if r[0]
            ])

    req = AISceneTestChatRequest(
        scene_code=scene_code,
        main_agent=AISceneTestAgentSelect(agent_code=main_agent_code, version=main_version),
        sub_agents=sub_agents,
        tool_ids=tool_ids,
        script_text=script_text,
        messages=history_messages,
        project_id=session.project_id,
        context_exclude_types=[],
    )

    user_message = await ai_chat_session_service.add_message(
        db=db,
        session_id=session_id,
        role="user",
        content=body.content,
    )

    if len(history_messages) == 1:
        new_title = await ai_chat_session_service.generate_session_title(
            scene_code=scene_code,
            first_message=body.content,
            timestamp=datetime.now(timezone.utc),
        )
        session.title = new_title

    trace_queue: asyncio.Queue = asyncio.Queue()

    async def iterator():
        yield f"data: {json.dumps({'type': 'start', 'session_id': str(session_id)}, ensure_ascii=False)}\n\n".encode("utf-8")
        output_text = ""
        plans: list = []
        trace_events: list = []
        archive: dict | None = None
        last_sent_at = time.monotonic()

        async def run_in_background():
            nonlocal output_text, plans, trace_events, archive
            output_text, plans, trace_events, archive = await run_scene_test_chat(
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
                trace_events.append(evt)
                yield f"data: {json.dumps({'type': 'tool_event', 'event': evt}, ensure_ascii=False)}\n\n".encode("utf-8")
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

        plans_data = [p.model_dump(mode="json") for p in plans]
        yield f"data: {json.dumps({'type': 'plans', 'plans': plans_data}, ensure_ascii=False)}\n\n".encode("utf-8")

        assistant_message = await ai_chat_session_service.add_message(
            db=db,
            session_id=session_id,
            role="assistant",
            content=output_text,
            plans=plans_data,
            trace=trace_events,
        )
        await ai_chat_session_service.touch_session(db=db, session_id=session_id)
        await db.commit()

        yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_message.id), 'content': output_text, 'plans': plans_data, 'trace': trace_events}, ensure_ascii=False)}\n\n".encode("utf-8")

    return StreamingResponse(
        iterator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
