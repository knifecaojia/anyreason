from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuiltinAgent, BuiltinAgentPromptVersion, Scene


@dataclass(frozen=True)
class BuiltinAgentSeed:
    agent_code: str
    name: str
    category: str
    description: str
    default_system_prompt: str


@dataclass(frozen=True)
class SceneSeed:
    scene_code: str
    name: str
    type: str
    description: str
    builtin_agent_code: str | None


BUILTIN_AGENT_SEEDS: list[BuiltinAgentSeed] = [
    BuiltinAgentSeed(
        agent_code="script_expert",
        name="剧本专家",
        category="script",
        description="整体剧本结构分析、风格诊断、逻辑检查",
        default_system_prompt="你是专业的剧本专家。请用清晰的结构分析用户提供的剧本内容，并给出可执行的改进建议。",
    ),
    BuiltinAgentSeed(
        agent_code="episode_expert",
        name="分集专家",
        category="episode",
        description="剧本分集、场次划分、节奏控制",
        default_system_prompt="你是专业的分集专家。请将用户提供的剧本拆分为分集与场次，并给出节奏与结构建议。",
    ),
    BuiltinAgentSeed(
        agent_code="prop_expert",
        name="道具专家",
        category="asset",
        description="提取道具清单、道具与剧情关联分析",
        default_system_prompt="你是道具专家。请从文本中提取道具清单，并说明每个道具与剧情的关系。",
    ),
    BuiltinAgentSeed(
        agent_code="character_expert",
        name="角色专家",
        category="asset",
        description="角色提取、人物关系图谱、角色弧光分析",
        default_system_prompt="你是角色专家。请从文本中提取角色，描述人物关系，并分析关键角色的弧光。",
    ),
    BuiltinAgentSeed(
        agent_code="scene_expert",
        name="场景专家",
        category="scene",
        description="场景描述优化、空间布局、氛围设计",
        default_system_prompt="你是场景专家。请把用户的场景描述改写得更具画面感，并给出空间布局与氛围建议。",
    ),
    BuiltinAgentSeed(
        agent_code="vfx_expert",
        name="特效专家",
        category="vfx",
        description="特效需求识别、特效与分镜匹配",
        default_system_prompt="你是特效专家。请识别文本中的特效需求，并给出与镜头/分镜匹配的特效建议。",
    ),
    BuiltinAgentSeed(
        agent_code="storyboard_expert",
        name="分镜专家",
        category="storyboard",
        description="分镜脚本生成、镜头语言设计",
        default_system_prompt="你是分镜专家。请基于剧情生成分镜脚本，包含镜头语言、景别与运镜建议。",
    ),
]


SCENE_SEEDS: list[SceneSeed] = [
    SceneSeed(
        scene_code="chat",
        name="自由对话",
        type="chat",
        description="普通自由对话",
        builtin_agent_code="script_expert",
    ),
    SceneSeed(
        scene_code="script_split",
        name="剧本分集",
        type="process",
        description="剧本分集与场次划分",
        builtin_agent_code="episode_expert",
    ),
    SceneSeed(
        scene_code="episode_characters",
        name="角色提取（剧集）",
        type="process",
        description="从指定剧集的剧本文本中提取角色列表",
        builtin_agent_code="character_expert",
    ),
    SceneSeed(
        scene_code="asset_extract",
        name="资产提取",
        type="process",
        description="资产提取（角色/道具/场景/特效）",
        builtin_agent_code=None,
    ),
    SceneSeed(
        scene_code="scene_create",
        name="场景创建",
        type="process",
        description="基于文本创建可视化场景描述",
        builtin_agent_code="scene_expert",
    ),
    SceneSeed(
        scene_code="storyboard_gen",
        name="分镜生成",
        type="process",
        description="分镜脚本生成",
        builtin_agent_code="storyboard_expert",
    ),
]


async def seed_agent_platform_assets(*, session: AsyncSession) -> None:
    agent_rows = (await session.execute(select(BuiltinAgent))).scalars().all()
    agents_by_code = {a.agent_code: a for a in agent_rows}

    for seed in BUILTIN_AGENT_SEEDS:
        existing = agents_by_code.get(seed.agent_code)
        if existing is not None:
            if not (getattr(existing, "name", None) or "").strip():
                existing.name = seed.name
            if not (getattr(existing, "description", None) or "").strip():
                existing.description = seed.description
            if not (getattr(existing, "category", None) or "").strip():
                existing.category = seed.category
            session.add(existing)
            continue
        a = BuiltinAgent(
            agent_code=seed.agent_code,
            name=seed.name,
            description=seed.description,
            category=seed.category,
            tools=[],
        )
        session.add(a)
        await session.flush()
        session.add(
            BuiltinAgentPromptVersion(
                builtin_agent_id=a.id,
                version=1,
                system_prompt=seed.default_system_prompt,
                description="seed v1",
                is_default=True,
                created_by=None,
                meta={},
            )
        )
        agents_by_code[seed.agent_code] = a

    scene_rows = (await session.execute(select(Scene))).scalars().all()
    scenes_by_code = {s.scene_code: s for s in scene_rows}
    for seed in SCENE_SEEDS:
        if seed.scene_code in scenes_by_code:
            continue
        builtin_agent_id = None
        if seed.builtin_agent_code:
            a = agents_by_code.get(seed.builtin_agent_code)
            if a is not None:
                builtin_agent_id = a.id
        session.add(
            Scene(
                scene_code=seed.scene_code,
                name=seed.name,
                type=seed.type,
                description=seed.description,
                builtin_agent_id=builtin_agent_id,
                required_tools=[],
                input_schema={},
                output_schema={},
                ui_config={},
            )
        )
