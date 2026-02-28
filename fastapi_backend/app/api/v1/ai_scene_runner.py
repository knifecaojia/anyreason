from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from uuid import UUID
import logging

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
    # Deprecated: use _resolve_default_version_test from ai_scene_test
    return 1

router = APIRouter()


def _tool_ids_for_scene(row: Scene) -> list[str]:
    # 优先使用场景配置的工具
    if row.required_tools:
        if isinstance(row.required_tools, list):
            return [str(t) for t in row.required_tools]
        # 如果是其他格式（如 dict），尝试提取 ids
        # 目前假定为 list[str]
    
    # 回退到默认逻辑（或者如果 required_tools 为空）
    # 但根据用户反馈，如果没有配置工具，就不应该有工具。
    # 之前的逻辑可能过于宽泛，包含了所有脚本工具。
    # 我们保留之前的逻辑作为兜底，但仅当 required_tools 确实未配置时？
    # 不，如果 required_tools 是空列表 []，那应该就是不需要工具。
    # 只有当 required_tools 为 None 时才使用默认逻辑？
    # 在 SQLAlchemy 模型中，required_tools 是 nullable=False, server_default='[]'
    # 所以它通常是 [] 而不是 None。
    
    # 如果是空列表，那就返回空列表。
    # 之前的逻辑会导致所有场景都有脚本工具，这可能是用户觉得“不一致”的原因。
    # 让我们完全信任 required_tools。
    if isinstance(row.required_tools, list):
        return [str(t) for t in row.required_tools]
        
    return []


@router.post("/ai/scenes/{scene_code}/chat/stream")
async def ai_scene_chat_stream(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    # This endpoint is deprecated in favor of the async task version
    # But we keep it for backward compatibility if needed, or redirect to task creation
    # For "full async", we should probably make this create a task too, 
    # but the frontend expects SSE. 
    # Let's return 410 Gone or similar to force frontend update?
    # Or just reuse the logic above to create a task and return it?
    # The user asked for "全面异步化", so we should guide frontend to use the task API.
    # However, changing the return type from StreamingResponse to JSON might break clients.
    # We will just implement the same logic as the non-stream version (create task)
    # and let the frontend handle the response change.
    
    return await ai_scene_chat(scene_code, body, db, user)


@router.post("/ai/scenes/{scene_code}/chat", response_model=ResponseBase[TaskRead])
async def ai_scene_chat(
    scene_code: str,
    body: AISceneRunChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[TaskRead]:
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
            # Check if user script text implies a specific episode
            # E.g. [当前剧集：第X集 - Title]
            # But the user might also want to select a specific episode in the UI
            # We don't have episode_id in the request body yet.
            # But if we did, we could filter here.
            # For now, let's include all episodes unless the prompt seems to be specific?
            # Actually, including all is safer for "context".
            
            # However, if the user explicitly selected one episode in UI, 
            # the frontend sends: `[当前剧集：第${selectedEpisode.episode_number}集...]\n\n`
            # We can try to parse that or just rely on the full context.
            # But wait, if we include ALL episodes, it might be too long.
            
            # Let's see if we can extract the episode number from the script_text prefix?
            # Or better, let's update the request model to accept episode_ids list?
            # But for now, let's just use a simple heuristic:
            # If the script_text starts with "[当前剧集：第X集", we ONLY include that episode?
            # No, maybe the user wants to reference previous episodes too.
            
            # Let's filter if we can find a match in the prefix
            import re
            
            # Priority: explicit episode_ids in body > prefix match in script_text
            target_ep_nums: list[int] | None = None
            
            if body.episode_ids:
                # If explicit IDs provided, use them directly
                # We need to map UUIDs to episode numbers or just check ID equality
                if ep.id not in body.episode_ids:
                    continue
            else:
                # Fallback to prefix matching
                # Support multiple episodes selection in context prefix
                # E.g. [选定剧集范围：第1集、第2集]
                # or [当前剧集：第1集 - Title]
                
                prefix_match = re.match(r"\[(当前剧集|选定剧集范围)：(.+?)\]", final_script_text)
                if prefix_match:
                    range_str = prefix_match.group(2) # "第1集 - Title" or "第1集、第2集"
                    # Extract all numbers from range_str
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

    logger.info(
        "[ai-scene-runner] created task=%s session_id=%s input_json.session_id=%s",
        task.id, body.session_id, req.model_dump(mode='json').get('session_id'),
    )

    if body.session_id:
        # Link task to session
        try:
            session_task = AIChatSessionTask(
                session_id=body.session_id,
                task_id=task.id,
            )
            db.add(session_task)
            # We don't commit here yet, let the next block handle commit or do it explicitly if needed
            # But the next block (user message) also commits.
            # To be safe and ensure task link is saved even if user message fails (unlikely),
            # or to bundle them?
            # Let's commit here to ensure the link exists before we return.
            await db.commit()
        except Exception as e:
            logger.error("[ai-scene-runner] failed to link task=%s to session=%s: %s", task.id, body.session_id, e)
            # Rollback only the current transaction part?
            # If create_task already committed, we are in a new transaction?
            # If create_task didn't commit, we might rollback the task too?
            # Assuming create_task commits.
            pass

        # Save user message immediately to session
        msg_content = ""
        if body.messages and body.messages[-1].role == "user":
            msg_content = body.messages[-1].content
        else:
            msg_content = body.script_text
            
        if msg_content:
             logger.info("[ai-scene-runner] saving user message to session=%s len=%d", body.session_id, len(msg_content))
             await ai_chat_session_service.add_message(
                db=db,
                session_id=body.session_id,
                role="user",
                content=msg_content,
            )
             await ai_chat_session_service.touch_session(db=db, session_id=body.session_id)
             
             # Must commit to persist the message and session update
             await db.commit()
             logger.info("[ai-scene-runner] committed user message to session=%s", body.session_id)
        else:
             logger.warning("[ai-scene-runner] no msg_content to save, session_id=%s", body.session_id)
    else:
        logger.info("[ai-scene-runner] no session_id in request, skipping user message save")

    return ResponseBase(code=200, msg="OK", data=TaskRead.model_validate(task))
