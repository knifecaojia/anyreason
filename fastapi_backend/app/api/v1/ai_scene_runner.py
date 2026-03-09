from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from uuid import UUID
import logging
import re

from app.database import User, get_async_session
from app.models import BuiltinAgent, BuiltinAgentPromptVersion, Scene, AIChatSessionTask
from app.schemas_ai_scene_test import AISceneTestAgentSelect, AISceneTestChatMessage, AISceneTestChatRequest
from app.schemas import TaskCreateRequest, TaskRead
from app.services.task_service import task_service
from app.services.ai_chat_session_service import ai_chat_session_service
from app.schemas_response import ResponseBase
from app.users import current_active_user
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.api.v1.ai_scene_test import _resolve_default_version as _resolve_default_version_test
from app.ai_scene_test.runner import run_scene_test_chat

logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field

class AISceneRunChatRequest(BaseModel):
    project_id: UUID | None = None
    session_id: UUID | None = None
    script_text: str | None = None
    messages: list[AISceneTestChatMessage] | None = None
    context_exclude_types: list[str] | None = None
    episode_ids: list[UUID] | None = None
    tool_ids: list[str] | None = None

async def _resolve_default_version(*, db: AsyncSession, agent_code: str) -> int:
    return 1

router = APIRouter()

def _tool_ids_for_scene(row: Scene) -> list[str]:
    if row.required_tools:
        if isinstance(row.required_tools, list):
            return [str(t) for t in row.required_tools]
    if isinstance(row.required_tools, list):
        return [str(t) for t in row.required_tools]
    return []

async def _build_scene_request(
    db: AsyncSession,
    scene_code: str,
    body: AISceneRunChatRequest
) -> tuple[Scene, AISceneTestChatRequest]:
    row = (
        await db.execute(
            select(Scene)
            .where(Scene.scene_code == scene_code)
            .options(selectinload(Scene.builtin_agent))
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="scene_not_found")

    final_script_text = body.script_text or ""
    
    if body.project_id:
        from app.models import Episode
        
        ep_rows = (
            await db.execute(
                select(Episode)
                .where(Episode.project_id == body.project_id)
                .order_by(Episode.episode_number.asc())
            )
        ).scalars().all()
        
        script_content = []
        for ep in ep_rows:
            target_ep_nums: list[int] | None = None
            
            if body.episode_ids:
                if ep.id not in body.episode_ids:
                    continue
            else:
                prefix_match = re.match(r"\[(当前剧集|选定剧集范围)：(.+?)\]", final_script_text)
                if prefix_match:
                    range_str = prefix_match.group(2)
                    target_ep_nums = [int(n) for n in re.findall(r"第(\d+)集", range_str)]
                    
                    if target_ep_nums:
                        if ep.episode_number not in target_ep_nums:
                            continue
            
            ep_text = ep.script_full_text or ""
            if ep_text.strip():
                script_content.append(f"## 第{ep.episode_number}集: {ep.title or ''}\n\n{ep_text}")
        
        if script_content:
            full_script = "\n\n".join(script_content)
            final_script_text = f"【参考剧本内容】\n{full_script}\n\n【用户指令】\n{final_script_text}"

    main_agent_code = None
    try:
        main_agent_code = row.builtin_agent.agent_code if row.builtin_agent else None
    except Exception:
        main_agent_code = None
    main_agent_code = (main_agent_code or "").strip() or "script_expert"
    main_version = await _resolve_default_version_test(db=db, agent_code=main_agent_code)

    tool_ids = list(body.tool_ids or []) if body.tool_ids is not None else _tool_ids_for_scene(row)
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
        v = await _resolve_default_version_test(db=db, agent_code=agent_code)
        sub_agents.append(AISceneTestAgentSelect(agent_code=agent_code, version=v))

    req = AISceneTestChatRequest(
        main_agent=AISceneTestAgentSelect(agent_code=main_agent_code, version=main_version),
        sub_agents=sub_agents,
        tool_ids=tool_ids,
        script_text=final_script_text,
        messages=list(body.messages or []),
        project_id=body.project_id,
        session_id=body.session_id,
        context_exclude_types=list(body.context_exclude_types or []),
        scene_code=scene_code,
    )
    
    return row, req

async def _save_user_message(db: AsyncSession, body: AISceneRunChatRequest):
    if not body.session_id:
        return
        
    msg_content = ""
    if body.messages and body.messages[-1].role == "user":
        msg_content = body.messages[-1].content
    else:
        msg_content = body.script_text
        
    if msg_content:
         await ai_chat_session_service.add_message(
            db=db,
            session_id=body.session_id,
            role="user",
            content=msg_content,
        )
         await ai_chat_session_service.touch_session(db=db, session_id=body.session_id)
         await db.commit()

@router.post("/ai/scenes/{scene_code}/chat/stream")
async def ai_scene_chat_stream(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    return await ai_scene_chat(scene_code, body, db, user)

@router.post("/ai/scenes/{scene_code}/chat", response_model=ResponseBase[TaskRead])
async def ai_scene_chat(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[TaskRead]:
    row, req = await _build_scene_request(db, scene_code, body)

    task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="ai_assistant_chat",
            input_json=req.model_dump(mode='json'),
            entity_type="scene",
            entity_id=row.id,
        ),
    )

    logger.info("[ai-scene-runner] created task=%s", task.id)

    if body.session_id:
        try:
            session_task = AIChatSessionTask(session_id=body.session_id, task_id=task.id)
            db.add(session_task)
            await db.commit()
        except Exception:
            pass
        
        await _save_user_message(db, body)

    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))

@router.post("/ai/scenes/{scene_code}/chat/sync", response_model=ResponseBase[dict])
async def ai_scene_chat_sync(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[dict]:
    # 1. Build Request
    row, req = await _build_scene_request(db, scene_code, body)
    
    # 2. Save User Message (Optional, if session provided)
    if body.session_id:
        await _save_user_message(db, body)

    # 3. Run Sync
    output_text, plans, trace_events, archive = await run_scene_test_chat(
        body=req,
        db=db,
        user_id=user.id,
    )
    
    # 4. Save Assistant Message (Optional)
    if body.session_id:
        await ai_chat_session_service.add_message(
            db=db,
            session_id=body.session_id,
            role="assistant",
            content=output_text,
        )
        await db.commit()

    return ResponseBase(code=200, msg="OK", data={
        "result": output_text,
        "plans": [p.model_dump(mode="json") for p in plans],
        "trace_events": trace_events[-50:], # limit size
    })
