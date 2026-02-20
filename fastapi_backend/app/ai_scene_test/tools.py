from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator
from pydantic_ai import RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy import select

from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_scene_test.deps import SceneTestDeps
from app.ai_scene_test.service import resolve_builtin_agent_version
from app.ai_tools.apply_plan import ApplyPlan
from app.scene_engine.scenes.script_split import ScriptSplitOutput
from app.schemas import AIShotDraft
from app.services.context_builder_service import build_project_asset_context_bundle
from app.services.pydanticai_debug_log import (
    create_pydanticai_debug_logger,
    create_pydanticai_debug_logger_for_path,
    is_pydanticai_debug_enabled,
)
from app.models import Episode, Storyboard
from app.vfs_docs import AssetDocV1, AssetDocV2, EpisodeDocV1
from app.vfs_layout import asset_doc_filename, episode_filename
from app.vfs_renderers.asset_doc_renderer import render_asset_doc_md


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

    @field_validator("assets", mode="before")
    @classmethod
    def _coerce_assets(cls, v: Any) -> Any:
        if v is None:
            return []
        if not isinstance(v, list):
            return v
        out: list[Any] = []
        for item in v:
            if isinstance(item, str):
                s = item.strip()
                if (s.startswith("{") and s.endswith("}")) or (s.startswith("{'") and s.endswith("'}")):
                    try:
                        out.append(json.loads(s))
                        continue
                    except Exception:
                        try:
                            out.append(ast.literal_eval(s))
                            continue
                        except Exception:
                            out.append({"name": s})
                            continue
            out.append(item)
        return out


def _split_markdown_cards(markdown_text: str) -> list[str]:
    text = (markdown_text or "").strip()
    if not text:
        return []
    parts = [p.strip() for p in re.split(r"(?m)^\s*---\s*$", text) if p.strip()]
    if len(parts) > 1:
        return parts
    parts = [p.strip() for p in re.split(r"(?m)^\s*###\s*", text) if p.strip()]
    if len(parts) <= 1:
        return [text]
    return [f"### {p}".strip() for p in parts]


def _parse_keywords(raw: str) -> list[str]:
    parts = re.split(r"[,，、/|\s]+", (raw or "").strip())
    out: list[str] = []
    seen = set()
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def _parse_markdown_card(card_md: str, *, default_episode: int | None = None, keep_call_name_suffix: bool = False) -> dict[str, Any]:
    md = (card_md or "").strip()
    call_name = None
    m = re.search(r"(?im)^\s*###\s*[^:\n]*资产卡片\s*[:：]\s*([^\n]+)\s*$", md)
    if m:
        call_name = m.group(1).strip()
    name = None
    m = re.search(r"(?im)^\s*[-*]?\s*Name\s*[:：]\s*(.+?)\s*$", md)
    if m:
        name = m.group(1).strip()
    if not name:
        m = re.search(r"(?im)^\s*[-*]?\s*角色名\s*[:：]\s*(.+?)\s*$", md)
        if m:
            name = m.group(1).strip()
    if not name and call_name and call_name.startswith("@"):
        call_name_body = call_name[1:].strip()
        if keep_call_name_suffix:
            name = call_name_body or None
        else:
            name = call_name_body.split("_", 1)[0].strip() or None

    keywords: list[str] = []
    m = re.search(r"(?im)^\s*[-*]?\s*Keywords\s*[:：]\s*(.+?)\s*$", md)
    if m:
        keywords = _parse_keywords(m.group(1))
    if not keywords:
        m = re.search(r"(?im)^\s*[-*]?\s*关键词\s*[:：]\s*(.+?)\s*$", md)
        if m:
            keywords = _parse_keywords(m.group(1))

    first_ep: int | None = None
    m = re.search(r"(?im)^\s*[-*]?\s*FirstAppearanceEpisode\s*[:：]\s*(\\d{1,4})\s*$", md)
    if m:
        try:
            first_ep = int(m.group(1))
        except Exception:
            first_ep = None
    if first_ep is None:
        m = re.search(r"(?im)^\s*[-*]?\s*首次出场集数?\s*[:：]\s*(\\d{1,4})\s*$", md)
        if m:
            try:
                first_ep = int(m.group(1))
            except Exception:
                first_ep = None
    if first_ep is None:
        first_ep = default_episode

    return {
        "call_name": call_name,
        "name": name,
        "keywords": keywords,
        "first_appearance_episode": first_ep,
        "details_md": md + "\n",
    }


async def _run_structured_agent(
    *,
    ctx: RunContext[SceneTestDeps],
    agent_code: str,
    version: int,
    output_type: type[BaseModel],
    user_text: str,
    extra_instructions: str,
) -> BaseModel:
    debug_logger = None
    if is_pydanticai_debug_enabled():
        run_id = str(getattr(ctx.deps, "run_id", None) or "tool")
        p = getattr(ctx.deps, "debug_log_path", None)
        if p:
            debug_logger = create_pydanticai_debug_logger_for_path(run_id=run_id, file_path=Path(str(p)))
        else:
            debug_logger = create_pydanticai_debug_logger(run_id=run_id, tag="scene_test_structured_agent")

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
    input_text = user_text
    if ctx.deps.project_id:
        bundle = await build_project_asset_context_bundle(
            db=ctx.deps.db,
            user_id=ctx.deps.user_id,
            project_id=ctx.deps.project_id,
            exclude_types=set(ctx.deps.context_exclude_types or set()),
        )
        ctx.deps.context_snapshot_md = bundle.context_md
        ctx.deps.context_refs = list(bundle.refs or [])
        input_text = "\n\n".join(
            [
                "上下文（资产库）：",
                bundle.context_md,
                "用户输入：",
                user_text,
            ]
        ).strip()
    if debug_logger:
        await debug_logger.log(
            "tool_agent_run_start",
            {
                "agent": {"agent_code": resolved_agent.agent_code, "version": resolved_agent.version},
                "model": {"name": getattr(resolved_model, "model_name", None), "base_url": getattr(resolved_model, "base_url", None)},
                "output_type": getattr(output_type, "__name__", "unknown"),
                "instructions": instructions,
                "input_text": input_text,
                "project_id": str(ctx.deps.project_id) if ctx.deps.project_id else None,
                "context_exclude_types": sorted(list(ctx.deps.context_exclude_types or set())),
            },
        )
    result = await agent.run(input_text)
    if debug_logger:
        out_payload: Any
        try:
            out_payload = result.output.model_dump(mode="json")  # type: ignore[attr-defined]
        except Exception:
            out_payload = str(result.output)
        await debug_logger.log(
            "tool_agent_run_done",
            {
                "agent": {"agent_code": resolved_agent.agent_code, "version": resolved_agent.version},
                "output": out_payload,
            },
        )
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


async def _run_markdown_agent(
    *,
    ctx: RunContext[SceneTestDeps],
    agent_code: str,
    version: int,
    user_text: str,
    extra_instructions: str,
) -> str:
    debug_logger = None
    if is_pydanticai_debug_enabled():
        run_id = str(getattr(ctx.deps, "run_id", None) or "tool")
        p = getattr(ctx.deps, "debug_log_path", None)
        if p:
            debug_logger = create_pydanticai_debug_logger_for_path(run_id=run_id, file_path=Path(str(p)))
        else:
            debug_logger = create_pydanticai_debug_logger(run_id=run_id, tag="scene_test_markdown_agent")

    await _emit(
        ctx,
        {
            "type": "agent_run_start",
            "agent_code": agent_code,
            "version": int(version),
            "output_type": "markdown_text",
        },
    )
    resolved_agent = await resolve_builtin_agent_version(db=ctx.deps.db, agent_code=agent_code, version=version)
    resolved_model = await resolve_text_model_for_pydantic_ai(db=ctx.deps.db, binding_key="chatbox", ai_model_config_id=resolved_agent.ai_model_config_id)
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

    instructions = f"{resolved_agent.system_prompt}\n\n{extra_instructions}".strip()
    agent = Agent(model=model, instructions=instructions, model_settings=resolved_agent.model_settings, output_retries=3)

    input_text = user_text
    if ctx.deps.project_id:
        bundle = await build_project_asset_context_bundle(
            db=ctx.deps.db,
            user_id=ctx.deps.user_id,
            project_id=ctx.deps.project_id,
            exclude_types=set(ctx.deps.context_exclude_types or set()),
        )
        ctx.deps.context_snapshot_md = bundle.context_md
        ctx.deps.context_refs = list(bundle.refs or [])
        input_text = "\n\n".join(["上下文（资产库）：", bundle.context_md, "用户输入：", user_text]).strip()

    if debug_logger:
        await debug_logger.log(
            "tool_agent_run_start",
            {
                "agent": {"agent_code": resolved_agent.agent_code, "version": resolved_agent.version},
                "model": {"name": getattr(resolved_model, "model_name", None), "base_url": getattr(resolved_model, "base_url", None)},
                "output_type": "markdown_text",
                "instructions": instructions,
                "input_text": input_text,
                "project_id": str(ctx.deps.project_id) if ctx.deps.project_id else None,
                "context_exclude_types": sorted(list(ctx.deps.context_exclude_types or set())),
            },
        )

    result = await agent.run(input_text)
    raw_text = str(getattr(result, "output", "") or "")

    if debug_logger:
        await debug_logger.log(
            "tool_agent_run_done",
            {
                "agent": {"agent_code": resolved_agent.agent_code, "version": resolved_agent.version},
                "output": raw_text,
            },
        )
    await _emit(ctx, {"type": "agent_run_done", "agent_code": agent_code, "version": int(version), "output_type": "markdown_text"})
    return raw_text


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
    must_cover: list[str] = []
    if asset_type == "character":
        m = re.search(r"出场人物[:：]\s*(.+)", source_text)
        if m:
            raw = m.group(1).strip()
            parts = re.split(r"[\s,，、/]+", raw)
            must_cover = [p.strip() for p in parts if p.strip()]
    card_title_map = {
        "character": "角色资产卡片",
        "prop": "道具资产卡片",
        "location": "地点资产卡片",
        "vfx": "特效资产卡片",
    }
    card_title = card_title_map.get(asset_type, "资产卡片")
    extra = (
        f"请从用户提供的剧本文本中提取 {asset_type} 列表，并输出 Markdown。\n"
        "输出规则：\n"
        f"1) 每个条目输出一张卡片，卡片标题行固定为：### {card_title}：@调用名\n"
        "2) 每张卡片之间用一行 `---` 分隔\n"
        "3) 每张卡片必须包含以下锚点行（用于系统解析，Key: Value）：\n"
        "   - Name: 资产名称\n"
        "   - Keywords: 关键词1, 关键词2\n"
        "   - FirstAppearanceEpisode: 首次出场集数（不知道就留空或省略）\n"
        "4) 其余内容自由，可包含外观、性格映射、Visual Prompt、导演补全等\n"
        "5) 不要输出 JSON，不要输出额外解释段落\n"
        + (f"6) 必须覆盖出场人物行中列出的名字：{', '.join(must_cover)}\n" if must_cover else "")
    )
    raw_output_text = await _run_markdown_agent(ctx=ctx, agent_code=agent_code, version=version, user_text=source_text, extra_instructions=extra)

    default_episode: int | None = None
    m2 = re.search(r"剧本剧集：\\s*EP(\\d{1,4})", source_text)
    if m2:
        try:
            default_episode = int(m2.group(1))
        except Exception:
            default_episode = None

    cards = [_parse_markdown_card(c, default_episode=default_episode, keep_call_name_suffix=(asset_type == "location")) for c in _split_markdown_cards(raw_output_text)]
    normalized_cards: list[dict[str, Any]] = []
    for c in cards:
        if c.get("name"):
            normalized_cards.append(c)

    if not normalized_cards and must_cover:
        normalized_cards = [{"call_name": f"@{n}", "name": n, "keywords": [], "first_appearance_episode": default_episode, "details_md": raw_output_text.strip() + "\n"} for n in must_cover]
    elif not normalized_cards:
        normalized_cards = [{"call_name": None, "name": f"{label_map.get(asset_type, asset_type)}_未解析", "keywords": [], "first_appearance_episode": default_episode, "details_md": raw_output_text.strip() + "\n"}]

    if must_cover:
        existing_names = {str(c.get("name") or "").strip() for c in normalized_cards if str(c.get("name") or "").strip()}
        for n in must_cover:
            if n in existing_names:
                continue
            normalized_cards.append({"call_name": f"@{n}", "name": n, "keywords": [], "first_appearance_episode": default_episode, "details_md": raw_output_text.strip() + "\n"})

    docs: list[AssetDocV1] = []
    docs_v2: list[AssetDocV2] = []
    planned_files: list[dict] = []
    for c in normalized_cards:
        name = str(c.get("name") or "").strip()
        doc = AssetDocV1(
            type=asset_type,  # type: ignore[arg-type]
            name=name,
            description=None,
            keywords=list(c.get("keywords") or []),
            first_appearance_episode=c.get("first_appearance_episode"),
            meta={},
        )
        doc_v2 = AssetDocV2(
            type=asset_type,  # type: ignore[arg-type]
            name=doc.name,
            keywords=list(doc.keywords or []),
            first_appearance_episode=doc.first_appearance_episode,
            details_md=str(c.get("details_md") or "").strip() + "\n",
            provenance={
                "source_tool_id": f"preview_extract_{asset_type}",
                "agent_code": agent_code,
                "version": int(version),
                "call_name": c.get("call_name"),
            },
        )
        filename = asset_doc_filename(asset_type=asset_type, name=doc.name, asset_id=None)
        content_md = render_asset_doc_md(doc=doc_v2)
        planned_files.append({"type": asset_type, "name": doc.name, "filename": filename, "content_md": content_md})
        docs.append(doc)
        docs_v2.append(doc_v2)

    plan = ApplyPlan(
        kind="asset_create",
        tool_id=f"preview_extract_{asset_type}",
        inputs={"asset_type": asset_type, "assets": [d.model_dump() for d in docs_v2]},
        preview={"count": len(docs), "files": planned_files, "raw_output_text": raw_output_text},
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


class _StoryboardShotsOutput(BaseModel):
    shots: list[AIShotDraft] = Field(default_factory=list)


async def preview_storyboard_apply(
    ctx: RunContext[SceneTestDeps],
    storyboard_id: str | None = None,
    mode: Literal["replace", "append"] = "replace",
) -> ApplyPlan:
    await _emit(
        ctx,
        {
            "type": "tool_start",
            "tool_id": "preview_storyboard_apply",
            "label": "分镜创建预览",
            "storyboard_id": storyboard_id,
            "mode": mode,
        },
    )
    if not ctx.deps.project_id:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_storyboard_apply", "message": "project_id_required"})
        return ApplyPlan(kind="storyboard_apply", tool_id="preview_storyboard_apply", inputs={}, preview={"error": "project_id_required"})

    sb_uuid: UUID | None = None
    try:
        if storyboard_id:
            sb_uuid = UUID(str(storyboard_id))
    except Exception:
        sb_uuid = None

    storyboard: Storyboard | None = None
    episode: Episode | None = None
    if sb_uuid:
        row = (
            await ctx.deps.db.execute(
                select(Storyboard, Episode).join(Episode, Storyboard.episode_id == Episode.id).where(Storyboard.id == sb_uuid)
            )
        ).first()
        if row:
            storyboard, episode = row
        if storyboard is None or episode is None:
            sb_uuid = None
        elif episode.project_id != ctx.deps.project_id:
            storyboard = None
            episode = None
            sb_uuid = None

    scene_script = ""
    scene_code = ""
    scene_number = 0
    location = ""
    time_of_day = ""
    if storyboard is not None:
        scene_script = (storyboard.description or "").strip()
        scene_code = storyboard.scene_code or ""
        scene_number = int(storyboard.scene_number or 0)
        location = storyboard.location or ""
        time_of_day = storyboard.time_of_day or ""
    else:
        scene_script = (ctx.deps.script_text or "").strip()

    if not scene_script:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_storyboard_apply", "message": "empty_script"})
        return ApplyPlan(kind="storyboard_apply", tool_id="preview_storyboard_apply", inputs={}, preview={"error": "empty_script"})

    scene_info = "\n".join(
        [
            "<SCENE>",
            f"scene_code: {scene_code}",
            f"scene_number: {int(scene_number or 0)}",
            f"location: {location}",
            f"time_of_day: {time_of_day}",
            "</SCENE>",
            "",
            "<SCENE_SCRIPT>",
            scene_script,
            "</SCENE_SCRIPT>",
        ]
    ).strip()

    version = _pick_version(ctx, "storyboard_expert", 1)
    out = await _run_structured_agent(
        ctx=ctx,
        agent_code="storyboard_expert",
        version=version,
        output_type=_StoryboardShotsOutput,
        user_text=scene_info,
        extra_instructions=(
            "请将分场剧本拆解成镜头列表。\n"
            "要求：shots 至少 1 条；description 必须具体可拍；active_assets 尽量列出出镜资产名称或关键词。\n"
            "字段不确定用 null；不要输出解释文本。"
        ),
    )
    shots_out = _StoryboardShotsOutput.model_validate(out)
    shots = list(shots_out.shots or [])
    if not shots:
        shots = [AIShotDraft(description=(scene_script or "").strip() or None)]

    plan = ApplyPlan(
        kind="storyboard_apply",
        tool_id="preview_storyboard_apply",
        inputs={
            "project_id": str(ctx.deps.project_id),
            "storyboard_id": str(sb_uuid or ""),
            "mode": mode,
            "shots": [s.model_dump() for s in shots],
        },
        preview={
            "count": len(shots),
            "episode_number": int(getattr(episode, "episode_number", 0) or 0),
            "scene_number": int(scene_number or 0),
            "virtual": sb_uuid is None,
            "warning": "storyboard_id_required_for_apply" if sb_uuid is None else None,
        },
    )
    ctx.deps.plans.append(plan)
    await _emit(
        ctx,
        {
            "type": "tool_done",
            "tool_id": "preview_storyboard_apply",
            "label": "分镜创建预览",
            "preview": {"count": len(shots)},
        },
    )
    return plan


class _ImagePromptDraft(BaseModel):
    prompt_main: str = Field(default="")
    negative_prompt: str | None = None
    style_model: str | None = None
    aspect_ratio: str | None = None
    character_prompts: list[dict[str, Any]] = Field(default_factory=list)
    camera_settings: dict[str, Any] = Field(default_factory=dict)
    generation_notes: str | None = None


async def preview_image_prompt(ctx: RunContext[SceneTestDeps], storyboard_id: str) -> ApplyPlan:
    await _emit(
        ctx,
        {
            "type": "tool_start",
            "tool_id": "preview_image_prompt",
            "label": "分镜生图提示词预览",
            "storyboard_id": storyboard_id,
        },
    )
    if not ctx.deps.project_id:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_image_prompt", "message": "project_id_required"})
        return ApplyPlan(kind="image_prompt_upsert", tool_id="preview_image_prompt", inputs={}, preview={"error": "project_id_required"})

    try:
        sb_uuid = UUID(str(storyboard_id))
    except Exception:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_image_prompt", "message": "invalid_storyboard_id"})
        return ApplyPlan(kind="image_prompt_upsert", tool_id="preview_image_prompt", inputs={}, preview={"error": "invalid_storyboard_id"})

    row = (
        await ctx.deps.db.execute(
            select(Storyboard, Episode).join(Episode, Storyboard.episode_id == Episode.id).where(Storyboard.id == sb_uuid)
        )
    ).first()
    if not row:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_image_prompt", "message": "storyboard_not_found"})
        return ApplyPlan(kind="image_prompt_upsert", tool_id="preview_image_prompt", inputs={}, preview={"error": "storyboard_not_found"})
    storyboard, episode = row
    if episode.project_id != ctx.deps.project_id:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_image_prompt", "message": "project_mismatch"})
        return ApplyPlan(kind="image_prompt_upsert", tool_id="preview_image_prompt", inputs={}, preview={"error": "project_mismatch"})

    user_text = "\n\n".join(
        [
            "镜头信息：",
            f"shot_code: {storyboard.shot_code}",
            f"shot_type: {storyboard.shot_type or ''}",
            f"camera_move: {storyboard.camera_move or ''}",
            "画面描述：",
            (storyboard.description or "").strip(),
            "对白：",
            (storyboard.dialogue or "").strip(),
        ]
    ).strip()

    version = _pick_version(ctx, "image_prompt_expert", 1)
    out = await _run_structured_agent(
        ctx=ctx,
        agent_code="image_prompt_expert",
        version=version,
        output_type=_ImagePromptDraft,
        user_text=user_text,
        extra_instructions="请输出用于生图的提示词结构（prompt_main 必填），并尽量给出 negative_prompt 与 camera_settings。",
    )
    draft = _ImagePromptDraft.model_validate(out)
    plan = ApplyPlan(
        kind="image_prompt_upsert",
        tool_id="preview_image_prompt",
        inputs={
            "project_id": str(ctx.deps.project_id),
            "prompts": [
                {
                    "storyboard_id": str(sb_uuid),
                    **draft.model_dump(),
                }
            ],
        },
        preview={
            "episode_number": int(episode.episode_number or 0),
            "shot_code": storyboard.shot_code,
            "prompt_main": draft.prompt_main,
        },
    )
    ctx.deps.plans.append(plan)
    await _emit(ctx, {"type": "tool_done", "tool_id": "preview_image_prompt", "label": "分镜生图提示词预览"})
    return plan


class _VideoPromptDraft(_ImagePromptDraft):
    duration: float | None = None


async def preview_video_prompt(ctx: RunContext[SceneTestDeps], storyboard_id: str) -> ApplyPlan:
    await _emit(
        ctx,
        {
            "type": "tool_start",
            "tool_id": "preview_video_prompt",
            "label": "分镜生视频提示词预览",
            "storyboard_id": storyboard_id,
        },
    )
    if not ctx.deps.project_id:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_video_prompt", "message": "project_id_required"})
        return ApplyPlan(kind="video_prompt_upsert", tool_id="preview_video_prompt", inputs={}, preview={"error": "project_id_required"})

    try:
        sb_uuid = UUID(str(storyboard_id))
    except Exception:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_video_prompt", "message": "invalid_storyboard_id"})
        return ApplyPlan(kind="video_prompt_upsert", tool_id="preview_video_prompt", inputs={}, preview={"error": "invalid_storyboard_id"})

    row = (
        await ctx.deps.db.execute(
            select(Storyboard, Episode).join(Episode, Storyboard.episode_id == Episode.id).where(Storyboard.id == sb_uuid)
        )
    ).first()
    if not row:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_video_prompt", "message": "storyboard_not_found"})
        return ApplyPlan(kind="video_prompt_upsert", tool_id="preview_video_prompt", inputs={}, preview={"error": "storyboard_not_found"})
    storyboard, episode = row
    if episode.project_id != ctx.deps.project_id:
        await _emit(ctx, {"type": "tool_error", "tool_id": "preview_video_prompt", "message": "project_mismatch"})
        return ApplyPlan(kind="video_prompt_upsert", tool_id="preview_video_prompt", inputs={}, preview={"error": "project_mismatch"})

    user_text = "\n\n".join(
        [
            "镜头信息：",
            f"shot_code: {storyboard.shot_code}",
            f"shot_type: {storyboard.shot_type or ''}",
            f"camera_move: {storyboard.camera_move or ''}",
            "画面描述：",
            (storyboard.description or "").strip(),
            "对白：",
            (storyboard.dialogue or "").strip(),
        ]
    ).strip()

    version = _pick_version(ctx, "video_prompt_expert", 1)
    out = await _run_structured_agent(
        ctx=ctx,
        agent_code="video_prompt_expert",
        version=version,
        output_type=_VideoPromptDraft,
        user_text=user_text,
        extra_instructions="请输出用于生视频的提示词结构（prompt_main 必填），并尽量给出 negative_prompt、camera_settings 与 duration。",
    )
    draft = _VideoPromptDraft.model_validate(out)
    plan = ApplyPlan(
        kind="video_prompt_upsert",
        tool_id="preview_video_prompt",
        inputs={
            "project_id": str(ctx.deps.project_id),
            "prompts": [
                {
                    "storyboard_id": str(sb_uuid),
                    **draft.model_dump(),
                }
            ],
        },
        preview={
            "episode_number": int(episode.episode_number or 0),
            "shot_code": storyboard.shot_code,
            "prompt_main": draft.prompt_main,
        },
    )
    ctx.deps.plans.append(plan)
    await _emit(ctx, {"type": "tool_done", "tool_id": "preview_video_prompt", "label": "分镜生视频提示词预览"})
    return plan
