from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_runtime.chatbox_deps import ChatboxDeps
from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.core.exceptions import AppError
from app.models import Episode, Project
from app.services.agent_factory import resolve_builtin_agent


class EpisodeCharacterExtractInput(BaseModel):
    episode_id: UUID
    agent_code: str = Field(default="character_expert", min_length=1)
    binding_key: str | None = None


class EpisodeCharacterItem(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    first_appearance_episode: int | None = Field(default=None, ge=1)
    meta: dict = Field(default_factory=dict)


class EpisodeCharacterExtractOutput(BaseModel):
    episode_id: UUID
    characters: list[EpisodeCharacterItem]


async def run_episode_characters(
    *,
    db: AsyncSession,
    user_id: UUID,
    payload: EpisodeCharacterExtractInput,
) -> EpisodeCharacterExtractOutput:
    episode = await db.get(Episode, payload.episode_id)
    if episode is None:
        raise AppError(msg="Episode not found", code=404, status_code=404)

    if episode.project_id is not None:
        project = await db.get(Project, episode.project_id)
        if project is not None and project.owner_id is not None and project.owner_id != user_id:
            raise AppError(msg="Not authorized", code=403, status_code=403)

    source_text = (episode.script_full_text or "").strip()
    if not source_text:
        raise AppError(msg="Episode script is empty", code=400, status_code=400)

    agent_cfg = await resolve_builtin_agent(session=db, agent_code=payload.agent_code, user_id=user_id)
    resolved = await resolve_text_model_for_pydantic_ai(
        db=db,
        binding_key=payload.binding_key,
        ai_model_config_id=agent_cfg.ai_model_config_id,
    )

    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = OpenAIProvider(api_key=resolved.api_key, base_url=resolved.base_url)
    model = OpenAIChatModel(resolved.model_name, provider=provider)

    instructions = (
        f"{agent_cfg.system_prompt}\n\n"
        "请从用户提供的剧本文本中提取“角色”列表，并以结构化数据返回。\n"
        "要求：\n"
        "1) 角色 name 必须是文本中出现的称呼/姓名/代号（尽量统一同一角色的命名）\n"
        "2) description 用一句话概括身份/性格/关系（如果能确定）\n"
        "3) keywords 提供少量关键词（可选）\n"
        "4) 不要把场景/道具/地点当成角色\n"
    )

    agent = Agent(
        model=model,
        instructions=instructions,
        deps_type=ChatboxDeps,
        output_type=EpisodeCharacterExtractOutput,
        model_settings=agent_cfg.model_settings,
    )
    result = await agent.run(source_text, deps=ChatboxDeps(db=db, user_id=user_id))

    output = result.output
    return EpisodeCharacterExtractOutput(episode_id=payload.episode_id, characters=list(output.characters or []))

