from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_scene_test.deps import SceneTestDeps
from app.ai_scene_test.service import resolve_builtin_agent_version
from app.ai_tools.apply_plan import ApplyPlan
from app.scene_engine.scenes.script_split import ScriptSplitOutput
from app.vfs_docs import AssetDocV1, EpisodeDocV1
from app.vfs_layout import asset_filename, episode_filename


async def _emit(ctx: RunContext[SceneTestDeps], evt: dict) -> None:
    try:
        ctx.deps.trace_events.append(evt)
    except Exception:
        pass
    q = getattr(ctx.deps, "trace_queue", None)
    if q is None:
        return
    try:
        await q.put(evt)
    except Exception:
        return


class AssetExtractItem(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    first_appearance_episode: int | None = Field(default=None, ge=1)
    meta: dict = Field(default_factory=dict)


class AssetExtractOutput(BaseModel):
    assets: list[AssetExtractItem] = Field(default_factory=list)


async def _run_structured_agent(
    *,
    ctx: RunContext[SceneTestDeps],
    agent_code: str,
    version: int,
    output_type: type[BaseModel],
    user_text: str,
    extra_instructions: str,
) -> BaseModel:
    await _emit(
        ctx,
        {
            "type": "agent_run_start",
            "agent_code": agent_code,
            "version": int(version),
            "output_type": getattr(output_type, "__name__", "unknown"),
        },
    )
    resolved_agent = await resolve_builtin_agent_version(
        db=ctx.deps.db,
        agent_code=agent_code,
        version=version,
    )
    resolved_model = await resolve_text_model_for_pydantic_ai(
        db=ctx.deps.db,
        binding_key="chatbox",
        ai_model_config_id=resolved_agent.ai_model_config_id,
    )
    await _emit(
        ctx,
        {
            "type": "model_selected",
            "agent_code": agent_code,
            "version": int(version),
            "model": getattr(resolved_model, "model_name", None),
            "base_url": getattr(resolved_model, "base_url", None),
        },
    )
    provider = OpenAIProvider(api_key=resolved_model.api_key, base_url=resolved_model.base_url)
    model = OpenAIChatModel(resolved_model.model_name, provider=provider)

    from pydantic_ai import Agent

    instructions = f"{resolved_agent.system_prompt}\n\n{extra_instructions}\n\n输出要求：仅输出结构化数据，不要附加解释文本。".strip()
    agent = Agent(
        model=model,
        instructions=instructions,
        output_type=output_type,
        model_settings=resolved_agent.model_settings,
        output_retries=3,
    )
    result = await agent.run(user_text)
    await _emit(
        ctx,
        {
            "type": "agent_run_done",
            "agent_code": agent_code,
            "version": int(version),
            "output_type": getattr(output_type, "__name__", "unknown"),
        },
    )
    return result.output


def _pick_version(ctx: RunContext[SceneTestDeps], agent_code: str, default_version: int = 1) -> int:
    try:
        v = int((ctx.deps.agent_versions or {}).get(agent_code, default_version))
        return v if v > 0 else default_version
    except Exception:
        return default_version


async def preview_script_split(ctx: RunContext[SceneTestDeps]) -> ApplyPlan:
    await _emit(
        ctx,
        {
            "type": "tool_start",
            "tool_id": "preview_script_split",
            "label": "分集/场次拆分预览",
            "script_len": len((ctx.deps.script_text or "").strip()),
        },
    )
    script_text = (ctx.deps.script_text or "").strip()
    if not script_text:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_script_split", "message": "empty_script"})
        return ApplyPlan(kind="episode_save", tool_id="preview_script_split", inputs={}, preview={"error": "empty_script"})

    version = _pick_version(ctx, "episode_expert", 1)
    out = await _run_structured_agent(
        ctx=ctx,
        agent_code="episode_expert",
        version=version,
        output_type=ScriptSplitOutput,
        user_text=script_text,
        extra_instructions=(
            "请将文本拆分为分集与场次，并以结构化数据返回。"
            "要求：尽量给出每集标题与摘要；场次给出简短 summary。"
        ),
    )
    payload = ScriptSplitOutput.model_validate(out)

    planned_files: list[dict] = []
    episodes_docs: list[dict] = []
    for e in payload.episodes:
        md_lines = [f"# EP{int(e.episode_number):03d} {e.title or ''}".rstrip()]
        if e.summary:
            md_lines.append("")
            md_lines.append(e.summary)
        md_lines.append("")
        md_lines.append("## 场次")
        for s in e.scenes:
            md_lines.append(f"- SC{int(s.scene_number):02d}：{s.summary}")
        content_md = "\n".join(md_lines).strip() + "\n"
        doc = EpisodeDocV1(
            episode_number=int(e.episode_number),
            title=e.title,
            summary=e.summary,
            content_md=content_md,
        )
        filename = episode_filename(episode_number=doc.episode_number, title=doc.title)
        episodes_docs.append(doc.model_dump())
        planned_files.append(
            {
                "episode_number": int(doc.episode_number),
                "filename": filename,
                "content_md": doc.content_md,
            }
        )

    plan = ApplyPlan(
        kind="episode_save",
        tool_id="preview_script_split",
        inputs={"episodes": episodes_docs},
        preview={"episode_count": len(planned_files), "files": planned_files},
    )
    ctx.deps.plans.append(plan)
    await _emit(
        ctx,
        {
            "type": "tool_done",
            "tool_id": "preview_script_split",
            "label": "分集/场次拆分预览",
            "preview": {"episode_count": len(planned_files)},
        },
    )
    return plan


async def _preview_asset_extraction(
    *,
    ctx: RunContext[SceneTestDeps],
    agent_code: str,
    asset_type: Literal["character", "prop", "location", "vfx"],
) -> ApplyPlan:
    label_map = {
        "character": "角色提取预览",
        "prop": "道具提取预览",
        "location": "地点提取预览",
        "vfx": "特效提取预览",
    }
    await _emit(
        ctx,
        {
            "type": "tool_start",
            "tool_id": f"preview_extract_{asset_type}",
            "label": label_map.get(asset_type, f"preview_extract_{asset_type}"),
            "agent_code": agent_code,
            "version": int(_pick_version(ctx, agent_code, 1)),
            "script_len": len((ctx.deps.script_text or "").strip()),
        },
    )
    source_text = (ctx.deps.script_text or "").strip()
    if not source_text:
        await _emit(ctx, {"type": "tool_error", "tool_id": f"preview_extract_{asset_type}", "message": "empty_script"})
        return ApplyPlan(kind="asset_create", tool_id=f"preview_extract_{asset_type}", inputs={}, preview={"error": "empty_script"})

    version = _pick_version(ctx, agent_code, 1)
    extra = (
        f"请从用户提供的剧本文本中提取 {asset_type} 列表，并以结构化数据返回。\n"
        "要求：\n"
        "1) 尽量覆盖文本中出现或明确暗示的重要条目\n"
        "2) 每个条目只保留稳定且可复用的信息，避免堆砌无关细节\n"
        "3) 仅返回结构化数据，不输出额外解释\n"
    )
    out = await _run_structured_agent(
        ctx=ctx,
        agent_code=agent_code,
        version=version,
        output_type=AssetExtractOutput,
        user_text=source_text,
        extra_instructions=extra,
    )
    payload = AssetExtractOutput.model_validate(out)

    docs: list[AssetDocV1] = []
    planned_files: list[dict] = []
    for a in payload.assets:
        doc = AssetDocV1(
            type=asset_type,  # type: ignore[arg-type]
            name=a.name,
            description=a.description,
            keywords=list(a.keywords or []),
            first_appearance_episode=a.first_appearance_episode,
            meta=dict(a.meta or {}),
        )
        filename = asset_filename(asset_type=asset_type, name=doc.name, asset_id=None)
        planned_files.append({"type": asset_type, "name": doc.name, "filename": filename, "content_json": json.dumps(doc.model_dump(), ensure_ascii=False, indent=2)})
        docs.append(doc)

    plan = ApplyPlan(
        kind="asset_create",
        tool_id=f"preview_extract_{asset_type}",
        inputs={"asset_type": asset_type, "assets": [d.model_dump() for d in docs]},
        preview={"count": len(docs), "files": planned_files},
    )
    ctx.deps.plans.append(plan)
    await _emit(
        ctx,
        {
            "type": "tool_done",
            "tool_id": f"preview_extract_{asset_type}",
            "label": label_map.get(asset_type, f"preview_extract_{asset_type}"),
            "preview": {"count": len(docs)},
        },
    )
    return plan


async def preview_extract_characters(ctx: RunContext[SceneTestDeps]) -> ApplyPlan:
    return await _preview_asset_extraction(ctx=ctx, agent_code="character_expert", asset_type="character")


async def preview_extract_props(ctx: RunContext[SceneTestDeps]) -> ApplyPlan:
    return await _preview_asset_extraction(ctx=ctx, agent_code="prop_expert", asset_type="prop")


async def preview_extract_locations(ctx: RunContext[SceneTestDeps]) -> ApplyPlan:
    return await _preview_asset_extraction(ctx=ctx, agent_code="scene_expert", asset_type="location")


async def preview_extract_vfx(ctx: RunContext[SceneTestDeps]) -> ApplyPlan:
    return await _preview_asset_extraction(ctx=ctx, agent_code="vfx_expert", asset_type="vfx")
