from __future__ import annotations

import difflib
import json
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic_ai import RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.ai_runtime.chatbox_deps import ChatboxDeps
from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_tools.apply_plan import ApplyPlan
from app.core.exceptions import AppError
from app.models import Project
from app.scene_engine.scenes.episode_characters import EpisodeCharacterExtractInput, run_episode_characters
from app.scene_engine.scenes.script_split import ScriptSplitOutput
from app.services.agent_factory import resolve_builtin_agent
from app.vfs_docs import AssetDocV1, AssetDocV2, EpisodeAssetBindingV1, EpisodeBindingsDocV1
from app.vfs_layout import asset_doc_filename, asset_filename, bindings_filename, episode_filename
from app.vfs_renderers.asset_doc_renderer import render_asset_doc_md


class EpisodeDoc(BaseModel):
    episode_number: int = Field(ge=1)
    title: str | None = None
    content_md: str = Field(default="", description="该集的 markdown 内容")


async def script_segmenter(ctx: RunContext[ChatboxDeps], script_text: str) -> ScriptSplitOutput:
    agent_cfg = await resolve_builtin_agent(session=ctx.deps.db, agent_code="episode_expert", user_id=ctx.deps.user_id)
    resolved = await resolve_text_model_for_pydantic_ai(
        db=ctx.deps.db,
        binding_key=None,
        ai_model_config_id=agent_cfg.ai_model_config_id,
    )
    provider = OpenAIProvider(api_key=resolved.api_key, base_url=resolved.base_url)
    model = OpenAIChatModel(resolved.model_name, provider=provider)
    from pydantic_ai import Agent

    agent = Agent(
        model=model,
        instructions=(agent_cfg.system_prompt or "").strip() + "\n\n输出要求：仅输出结构化数据，不要附加解释文本。",
        output_type=ScriptSplitOutput,
        model_settings=agent_cfg.model_settings,
        output_retries=3,
    )
    result = await agent.run(script_text)
    return result.output


class AssetExtractItem(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    first_appearance_episode: int | None = Field(default=None, ge=1)
    meta: dict = Field(default_factory=dict)


class AssetExtractOutput(BaseModel):
    assets: list[AssetExtractItem]


async def _run_asset_extractor(
    *,
    ctx: RunContext[ChatboxDeps],
    agent_code: str,
    asset_type: str,
    source_text: str,
) -> list[AssetDocV1]:
    agent_cfg = await resolve_builtin_agent(session=ctx.deps.db, agent_code=agent_code, user_id=ctx.deps.user_id)
    resolved = await resolve_text_model_for_pydantic_ai(
        db=ctx.deps.db,
        binding_key=None,
        ai_model_config_id=agent_cfg.ai_model_config_id,
    )
    provider = OpenAIProvider(api_key=resolved.api_key, base_url=resolved.base_url)
    model = OpenAIChatModel(resolved.model_name, provider=provider)
    from pydantic_ai import Agent

    instructions = (
        f"{agent_cfg.system_prompt}\n\n"
        f"请从用户提供的文本中提取 {asset_type} 列表，并以结构化数据返回。\n"
        "要求：\n"
        "1) 尽量覆盖文本中出现或明确暗示的重要条目\n"
        "2) 每个条目只保留稳定且可复用的信息，避免堆砌无关细节\n"
    )

    agent = Agent(
        model=model,
        instructions=instructions,
        output_type=AssetExtractOutput,
        model_settings=agent_cfg.model_settings,
        output_retries=3,
    )
    result = await agent.run(source_text)
    assets = []
    for a in result.output.assets:
        assets.append(
            AssetDocV1(
                type=asset_type,  # type: ignore[arg-type]
                name=a.name,
                description=a.description,
                keywords=list(a.keywords or []),
                first_appearance_episode=a.first_appearance_episode,
                meta=dict(a.meta or {}),
            )
        )
    return assets


async def extract_characters(ctx: RunContext[ChatboxDeps], source_text: str) -> list[AssetDocV1]:
    return await _run_asset_extractor(ctx=ctx, agent_code="character_expert", asset_type="character", source_text=source_text)


async def extract_episode_characters(ctx: RunContext[ChatboxDeps], episode_id: UUID) -> list[AssetDocV1]:
    out = await run_episode_characters(
        db=ctx.deps.db,
        user_id=ctx.deps.user_id,
        payload=EpisodeCharacterExtractInput(episode_id=episode_id),
    )
    assets: list[AssetDocV1] = []
    for c in out.characters:
        assets.append(
            AssetDocV1(
                type="character",  # type: ignore[arg-type]
                name=c.name,
                description=c.description,
                keywords=list(c.keywords or []),
                first_appearance_episode=c.first_appearance_episode,
                meta=dict(c.meta or {}),
            )
        )
    if not assets:
        raise AppError(msg="未提取到角色", code=400, status_code=400)
    return assets


async def extract_props(ctx: RunContext[ChatboxDeps], source_text: str) -> list[AssetDocV1]:
    return await _run_asset_extractor(ctx=ctx, agent_code="prop_expert", asset_type="prop", source_text=source_text)


async def extract_locations(ctx: RunContext[ChatboxDeps], source_text: str) -> list[AssetDocV1]:
    return await _run_asset_extractor(ctx=ctx, agent_code="scene_expert", asset_type="location", source_text=source_text)


async def extract_vfx(ctx: RunContext[ChatboxDeps], source_text: str) -> list[AssetDocV1]:
    return await _run_asset_extractor(ctx=ctx, agent_code="vfx_expert", asset_type="vfx", source_text=source_text)


class DedupCandidate(BaseModel):
    left_index: int = Field(ge=0)
    right_index: int = Field(ge=0)
    score: float = Field(ge=0.0, le=1.0)
    reason: str


async def asset_deduplicator_preview(ctx: RunContext[ChatboxDeps], assets: list[AssetDocV1 | AssetDocV2]) -> list[DedupCandidate]:
    _ = ctx
    out: list[DedupCandidate] = []
    for i in range(len(assets)):
        for j in range(i + 1, len(assets)):
            a = assets[i]
            b = assets[j]
            if a.type != b.type:
                continue
            score = difflib.SequenceMatcher(a=a.name.lower(), b=b.name.lower()).ratio()
            if score >= 0.85:
                out.append(
                    DedupCandidate(
                        left_index=i,
                        right_index=j,
                        score=float(score),
                        reason="name_similarity",
                    )
                )
    out.sort(key=lambda x: x.score, reverse=True)
    return out[:50]


async def asset_create(
    ctx: RunContext[ChatboxDeps],
    project_id: UUID,
    assets: list[AssetDocV1 | AssetDocV2],
    dry_run: bool = True,
) -> ApplyPlan:
    project = await ctx.deps.db.get(Project, project_id)
    if project is None:
        raise ValueError("project_not_found")

    planned_files: list[dict] = []
    counts: dict[str, int] = {"character": 0, "prop": 0, "location": 0, "vfx": 0}
    for a in assets:
        counts[a.type] = counts.get(a.type, 0) + 1
        filename = asset_doc_filename(asset_type=a.type, name=a.name, asset_id=None)
        content_md = ""
        if isinstance(a, AssetDocV2):
            content_md = render_asset_doc_md(doc=a)
        else:
            details_md_parts: list[str] = []
            if a.description:
                details_md_parts.append(a.description.strip())
            if a.meta:
                details_md_parts.append("```json")
                details_md_parts.append(json.dumps(a.meta, ensure_ascii=False, indent=2))
                details_md_parts.append("```")
            v2 = AssetDocV2(
                type=a.type,
                name=a.name,
                keywords=list(a.keywords or []),
                first_appearance_episode=a.first_appearance_episode,
                details_md="\n\n".join([p for p in details_md_parts if p]).strip() + ("\n" if details_md_parts else ""),
                provenance={"source_tool_id": "asset_create"},
            )
            content_md = render_asset_doc_md(doc=v2)
        planned_files.append({"type": a.type, "name": a.name, "filename": filename, "content_md": content_md})

    plan = ApplyPlan(
        kind="asset_create",
        tool_id="asset_create",
        inputs={
            "project_id": str(project_id),
            "assets": [a.model_dump() for a in assets],
        },
        preview={
            "dry_run": bool(dry_run),
            "counts": counts,
            "files": planned_files,
        },
    )
    if dry_run:
        return plan
    return plan


async def episode_asset_bind(
    ctx: RunContext[ChatboxDeps],
    project_id: UUID,
    episode_number: int,
    bindings: list[EpisodeAssetBindingV1],
    dry_run: bool = True,
) -> ApplyPlan:
    project = await ctx.deps.db.get(Project, project_id)
    if project is None:
        raise ValueError("project_not_found")

    if episode_number <= 0:
        raise ValueError("episode_number_invalid")
    doc = EpisodeBindingsDocV1(episode_number=episode_number, bindings=bindings or [])
    filename = bindings_filename(episode_number=episode_number)
    plan = ApplyPlan(
        kind="asset_bind",
        tool_id="asset_bind",
        inputs={
            "project_id": str(project_id),
            "episode_number": int(episode_number),
            "bindings_doc": doc.model_dump(),
            "filename": filename,
            "content_json": json.dumps(doc.model_dump(), ensure_ascii=False, indent=2),
        },
        preview={
            "dry_run": bool(dry_run),
            "episode_number": int(episode_number),
            "binding_count": len(bindings),
            "filename": filename,
        },
    )
    if dry_run:
        return plan
    return plan


async def episode_save(
    ctx: RunContext[ChatboxDeps],
    project_id: UUID,
    episodes: list[EpisodeDoc],
    dry_run: bool = True,
) -> ApplyPlan:
    project = await ctx.deps.db.get(Project, project_id)
    if project is None:
        raise ValueError("project_not_found")

    planned_files: list[dict] = []
    for e in episodes:
        filename = episode_filename(episode_number=e.episode_number, title=e.title)
        planned_files.append({"episode_number": e.episode_number, "filename": filename, "size_chars": len(e.content_md or "")})

    plan = ApplyPlan(
        kind="episode_save",
        tool_id="episode_save",
        inputs={
            "project_id": str(project_id),
            "episodes": [e.model_dump() for e in episodes],
        },
        preview={
            "dry_run": bool(dry_run),
            "episode_count": len(episodes),
            "files": planned_files,
        },
    )
    if dry_run:
        return plan

    return plan


async def asset_variant_decide(
    ctx: RunContext[ChatboxDeps],
    project_id: UUID,
    asset_type: str,
    asset_name: str,
    content_md: str,
    match_type: str = "same_asset_new_variant",
    confidence: float = 0.8,
    reason_md: str = "",
    diff_md: str = "",
    node_id: str | None = None,
    dry_run: bool = True,
) -> ApplyPlan:
    project = await ctx.deps.db.get(Project, project_id)
    if project is None:
        raise ValueError("project_not_found")

    filename = asset_doc_filename(asset_type=asset_type, name=asset_name, asset_id=None)
    plan = ApplyPlan(
        kind="asset_doc_upsert",
        tool_id="asset_doc_upsert",
        inputs={
            "project_id": str(project_id),
            "asset_type": asset_type,
            "asset_name": asset_name,
            "node_id": node_id,
            "content_md": content_md,
            "match_type": match_type,
            "confidence": float(confidence),
            "reason_md": reason_md,
            "diff_md": diff_md,
            "filename": filename,
        },
        preview={
            "dry_run": bool(dry_run),
            "asset_type": asset_type,
            "asset_name": asset_name,
            "filename": filename,
            "match_type": match_type,
            "confidence": float(confidence),
        },
    )
    if dry_run:
        return plan
    return plan
