from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.scene_engine.utils import extract_chat_completion_text, parse_json_object
from app.services.agent_factory import resolve_builtin_agent


class ScriptSplitInput(BaseModel):
    script_text: str = Field(min_length=1)


class ScriptSplitScene(BaseModel):
    scene_number: int
    summary: str


class ScriptSplitEpisode(BaseModel):
    episode_number: int
    title: str | None = None
    summary: str | None = None
    scenes: list[ScriptSplitScene]


class ScriptSplitOutput(BaseModel):
    episodes: list[ScriptSplitEpisode]


async def run_script_split(
    *,
    db: AsyncSession,
    user_id: UUID,
    payload: ScriptSplitInput,
    agent_code: str = "episode_expert",
) -> ScriptSplitOutput:
    agent_cfg = await resolve_builtin_agent(
        session=db,
        agent_code=agent_code,
        user_id=user_id,
    )

    schema = ScriptSplitOutput.model_json_schema()
    system_prompt = (
        f"{agent_cfg.system_prompt}\n\n"
        "请将用户提供的剧本拆分为分集与场次，并严格输出 JSON。\n"
        "要求：\n"
        "1) 仅输出 JSON，不要输出多余文字\n"
        "2) 必须符合下面的 JSON Schema\n"
        f"{schema}\n"
    )

    raw = await ai_gateway_service.chat_text(
        db=db,
        user_id=user_id,
        binding_key=None,
        model_config_id=agent_cfg.ai_model_config_id,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": payload.script_text},
        ],
        attachments=[],
        credits_cost=0,
    )

    text = extract_chat_completion_text(raw)
    obj: Any = parse_json_object(text)
    return ScriptSplitOutput.model_validate(obj)

