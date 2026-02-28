from __future__ import annotations

import functools
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from pydantic_ai import RunContext

from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_scene_test.deps import SceneTestDeps
from app.ai_scene_test.service import resolve_builtin_agent_version
from app.ai_scene_test.tool_registry import TOOL_REGISTRY
from app.schemas_ai_scene_test import AISceneTestChatRequest
from app.services.ai_run_archive_service import archive_ai_run
from app.services.pydanticai_debug_log import create_pydanticai_debug_logger, is_pydanticai_debug_enabled


async def run_scene_test_chat(
    *,
    body: AISceneTestChatRequest,
    db: AsyncSession,
    user_id: UUID,
    trace_queue: Any | None = None,
    task_id: UUID | None = None,
) -> tuple[str, list, list[dict[str, Any]], dict[str, Any] | None]:
    run_id = str(task_id) if task_id else uuid4().hex
    # If task_id is provided, we force enable debug logging to capture execution details for this task
    force_debug = bool(task_id)
    debug_logger = create_pydanticai_debug_logger(run_id=run_id, tag="scene_test_chat", force_enable=force_debug)
    
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
        project_id=body.project_id,
        context_exclude_types=set(body.context_exclude_types or []),
        agent_versions=agent_versions,
        trace_queue=trace_queue,
        meta={"model": getattr(resolved_model, "model_name", None), "scene_code": body.scene_code},
        run_id=run_id,
        debug_log_path=str(debug_logger.file_path) if (is_pydanticai_debug_enabled() or force_debug) else None,
        episode_ids=body.episode_ids,
    )

    tool_ids = list(body.tool_ids or [])
    tools = []
    for tid in tool_ids:
        entry = TOOL_REGISTRY.get(tid)
        if entry is None:
            continue
        # Use a closure to capture the specific tool function and ID
        def make_logged_tool(tool_id: str, tool_fn: Any):
            @functools.wraps(tool_fn)
            async def _logged_tool(ctx: RunContext[SceneTestDeps], *args: Any, **kwargs: Any):
                if debug_logger:
                    await debug_logger.log(
                        "tool_call_start",
                        {
                            "tool_id": tool_id,
                            "tool_name": getattr(tool_fn, "__name__", ""),
                            "args": list(args),
                            "kwargs": kwargs,
                            "agent_versions": dict(getattr(ctx.deps, "agent_versions", {}) or {}),
                            "project_id": str(getattr(ctx.deps, "project_id", "") or ""),
                        },
                    )
                out = await tool_fn(ctx, *args, **kwargs)
                if debug_logger:
                    payload: Any
                    try:
                        payload = out.model_dump(mode="json")  # type: ignore[attr-defined]
                    except Exception:
                        payload = str(out)
                    await debug_logger.log(
                        "tool_call_done",
                        {
                            "tool_id": tool_id,
                            "tool_name": getattr(tool_fn, "__name__", ""),
                            "output": payload,
                        },
                    )
                return out
            return _logged_tool
        
        tools.append(make_logged_tool(tid, entry[0]))

    instructions = main.system_prompt
    agent = Agent(model=model, instructions=instructions, tools=tools, model_settings=main.model_settings)

    chat_lines: list[str] = []
    for m in body.messages or []:
        role = str(getattr(m, "role", "") or "").strip() or "user"
        content = str(getattr(m, "content", "") or "").strip()
        if not content:
            continue
        chat_lines.append(f"[{role}] {content}")
    user_intent = "\n".join(chat_lines).strip() or "请基于剧本文本评估并输出预览结果。"

    # Build tool instruction: when multiple tools are provided, explicitly instruct
    # the agent to call ALL of them. This prevents the LLM from skipping tools
    # (e.g. skipping location extraction when 4 extraction tools are given).
    tool_instruction = ""
    if len(tool_ids) > 1:
        tool_labels = []
        for tid in tool_ids:
            reg = TOOL_REGISTRY.get(tid)
            label = reg[1] if reg else tid
            tool_labels.append(f"  - {tid}（{label}）")
        tool_instruction = (
            "\n\n【重要：工具调用要求】\n"
            "你必须依次调用以下所有工具，每个工具都必须被调用一次，不可遗漏：\n"
            + "\n".join(tool_labels)
            + "\n请逐一调用上述全部工具，将每个工具的结果汇总后再输出最终回复。\n"
        )

    input_text = f"剧本文本：\n{deps.script_text}\n\n对话：\n{user_intent}\n{tool_instruction}"
    await debug_logger.log(
        "main_agent_run_start",
        {
            "main_agent": {"agent_code": main.agent_code, "version": main.version},
            "sub_agents": list((body.sub_agents or [])),
            "agent_versions": agent_versions,
            "model": {"name": getattr(resolved_model, "model_name", None), "base_url": getattr(resolved_model, "base_url", None)},
            "tool_ids": tool_ids,
            "project_id": str(deps.project_id) if deps.project_id else None,
            "context_exclude_types": sorted(list(deps.context_exclude_types or set())),
            "instructions": instructions,
            "input_text": input_text,
        },
    )
    result = await agent.run(input_text, deps=deps)
    output_text = str(result.output)
    plans = list(deps.plans or [])
    trace_events = list(deps.trace_events or [])
    await debug_logger.log(
        "main_agent_run_done",
        {
            "output_text": output_text,
            "plans": [p.model_dump(mode="json") for p in plans],
            "trace_events": trace_events[-200:],
        },
    )

    archive: dict[str, Any] | None = None
    if deps.project_id:
        archived = await archive_ai_run(
            db=db,
            user_id=user_id,
            project_id=deps.project_id,
            run_label="scene_test_chat",
            run_md=output_text,
            run_context_md=deps.context_snapshot_md or "",
            plans=[p.model_dump(mode="json") for p in plans],
            trace_events=trace_events,
        )
        archive = {
            "project_id": str(archived.project_id),
            "ai_root_node_id": str(archived.ai_root_node_id),
            "run_folder_node_id": str(archived.run_folder_node_id),
            "run_md_node_id": str(archived.run_md_node_id),
            "run_context_md_node_id": str(archived.run_context_md_node_id),
            "plan_json_node_id": str(archived.plan_json_node_id),
            "trace_json_node_id": str(archived.trace_json_node_id) if archived.trace_json_node_id else None,
        }
        await debug_logger.log("archive_written", archive)

    return output_text, plans, trace_events, archive
