from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_scene_test.deps import SceneTestDeps
from app.ai_scene_test.service import resolve_builtin_agent_version
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.schemas_ai_scene_test import AISceneTestChatRequest


async def run_scene_test_chat(
    *,
    body: AISceneTestChatRequest,
    db: AsyncSession,
    user_id: UUID,
    trace_queue: Any | None = None,
) -> tuple[str, list, list[dict[str, Any]]]:
    main = await resolve_builtin_agent_version(
        db=db,
        agent_code=body.main_agent.agent_code,
        version=body.main_agent.version,
    )
    resolved_model = await resolve_text_model_for_pydantic_ai(
        db=db,
        binding_key="chatbox",
        ai_model_config_id=main.ai_model_config_id,
    )

    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = OpenAIProvider(api_key=resolved_model.api_key, base_url=resolved_model.base_url)
    model = OpenAIChatModel(resolved_model.model_name, provider=provider)

    agent_versions = {body.main_agent.agent_code: int(body.main_agent.version)}
    for a in body.sub_agents or []:
        if not a.agent_code:
            continue
        agent_versions[str(a.agent_code)] = int(a.version)

    deps = SceneTestDeps(
        db=db,
        user_id=user_id,
        script_text=body.script_text or "",
        agent_versions=agent_versions,
        trace_queue=trace_queue,
        meta={"model": getattr(resolved_model, "model_name", None)},
    )

    tool_ids = list(body.tool_ids or [])
    tools = []
    for tid in tool_ids:
        reg = TOOL_REGISTRY.get(tid)
        if reg is None:
            continue
        tools.append(reg[0])

    instructions = (
        f"{main.system_prompt}\n\n"
        "你正在一个“内置场景能力测试台”中工作。\n"
        "你可以调用可用工具来生成“预览落库结果（ApplyPlan）”。\n"
        "规则：\n"
        "1) 如果用户没有提供剧本文本，请先询问用户粘贴剧本文本。\n"
        "2) 若用户要求提取/拆分等能力，请优先调用工具。\n"
        "3) 返回内容需包含清晰的结论与下一步建议。\n"
    )
    agent = Agent(model=model, instructions=instructions, tools=tools, model_settings=main.model_settings)

    chat_lines: list[str] = []
    for m in body.messages or []:
        role = str(getattr(m, "role", "") or "").strip() or "user"
        content = str(getattr(m, "content", "") or "").strip()
        if not content:
            continue
        chat_lines.append(f"[{role}] {content}")
    user_intent = "\n".join(chat_lines).strip() or "请基于剧本文本评估并输出预览结果。"

    input_text = f"剧本文本：\n{deps.script_text}\n\n对话：\n{user_intent}\n"
    result = await agent.run(input_text, deps=deps)
    return str(result.output), list(deps.plans or []), list(deps.trace_events or [])
