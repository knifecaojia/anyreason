from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_scene_test.runner import run_scene_test_chat
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.database import User, get_async_session
from app.rbac import require_permissions
from app.schemas_ai_scene_test import AISceneTestChatRequest, AISceneTestChatResponse, AISceneTestOptionsResponse
from app.models import BuiltinAgent, BuiltinAgentPromptVersion
from sqlalchemy import select
from app.schemas_response import ResponseBase
from app.services.builtin_agent_version_service import builtin_agent_version_service
from app.users import current_active_user


router = APIRouter()


@router.get(
    "/ai/admin/scene-test/options",
    response_model=ResponseBase[AISceneTestOptionsResponse],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_ai_scene_test_options(
    db: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
) -> ResponseBase[AISceneTestOptionsResponse]:
    agents = await builtin_agent_version_service.list_builtin_agents(db=db)
    agent_opts = []
    for a in agents:
        versions = await builtin_agent_version_service.list_versions(db=db, agent_id=a.id)
        display_name = (getattr(a, "name", None) or "").strip() or a.agent_code
        agent_opts.append(
            {
                "agent_code": a.agent_code,
                "name": display_name,
                "category": a.category,
                "versions": [
                    {
                        "version": int(v.version),
                        "is_default": bool(v.is_default),
                        "description": v.description,
                        "created_at": v.created_at.isoformat() if getattr(v, "created_at", None) else None,
                    }
                    for v in versions
                ],
            }
        )
    agent_opts.sort(key=lambda x: x["agent_code"])

    tools = [{"tool_id": k, "label": v[1], "uses_agent_codes": list(v[2])} for k, v in TOOL_REGISTRY.items()]
    tools.sort(key=lambda x: x["tool_id"])

    return ResponseBase(code=200, msg="OK", data=AISceneTestOptionsResponse(agents=agent_opts, tools=tools))


async def _resolve_default_version(*, db: AsyncSession, agent_code: str) -> int:
    try:
        stmt = (
            select(BuiltinAgentPromptVersion.version)
            .join(BuiltinAgent, BuiltinAgentPromptVersion.builtin_agent_id == BuiltinAgent.id)
            .where(BuiltinAgent.agent_code == agent_code)
            .order_by(BuiltinAgentPromptVersion.is_default.desc(), BuiltinAgentPromptVersion.version.desc())
            .limit(1)
        )
        res = await db.execute(stmt)
        v = res.scalar_one_or_none()
        return int(v) if v else 1
    except Exception:
        return 1


async def _run_scene_test_chat(
    *,
    body: AISceneTestChatRequest,
    db: AsyncSession,
    user: User,
    trace_queue: asyncio.Queue | None = None,
) -> tuple[str, list, dict | None]:
    output_text, plans, _trace, archive = await run_scene_test_chat(
        body=body,
        db=db,
        user_id=user.id,
        trace_queue=trace_queue,
    )
    return output_text, plans, archive


@router.post(
    "/ai/admin/scene-test/chat",
    response_model=ResponseBase[AISceneTestChatResponse],
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_ai_scene_test_chat(
    body: AISceneTestChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AISceneTestChatResponse]:
    output_text, plans, archive = await _run_scene_test_chat(body=body, db=db, user=user, trace_queue=None)
    return ResponseBase(
        code=200,
        msg="OK",
        data=AISceneTestChatResponse(output_text=output_text, plans=plans, archive=archive),
    )


@router.post(
    "/ai/admin/scene-test/chat/stream",
    dependencies=[Depends(require_permissions(["system.ai_scenes"]))],
)
async def admin_ai_scene_test_chat_stream(
    body: AISceneTestChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    trace_queue: asyncio.Queue = asyncio.Queue()

    async def iterator():
        yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n".encode("utf-8")
        output_text = ""
        plans: list = []
        archive: dict | None = None
        last_sent_at = time.monotonic()

        async def run_in_background():
            nonlocal output_text, plans, archive
            output_text, plans, archive = await _run_scene_test_chat(body=body, db=db, user=user, trace_queue=trace_queue)

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

        yield f"data: {json.dumps({'type': 'plans', 'plans': [p.model_dump() for p in plans]}, ensure_ascii=False)}\n\n".encode('utf-8')
        if archive:
            yield f"data: {json.dumps({'type': 'archive', 'archive': archive}, ensure_ascii=False)}\n\n".encode('utf-8')
        yield f"data: {json.dumps({'type': 'done', 'output_text': output_text}, ensure_ascii=False)}\n\n".encode("utf-8")

    return StreamingResponse(
        iterator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
