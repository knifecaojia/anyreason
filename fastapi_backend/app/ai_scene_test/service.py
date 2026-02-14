from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import BuiltinAgent, BuiltinAgentPromptVersion


@dataclass(frozen=True)
class BuiltinAgentResolvedVersion:
    agent_code: str
    version: int
    system_prompt: str
    ai_model_config_id: Any | None
    model_settings: dict


async def resolve_builtin_agent_version(
    *,
    db: AsyncSession,
    agent_code: str,
    version: int,
) -> BuiltinAgentResolvedVersion:
    agent = (await db.execute(select(BuiltinAgent).where(BuiltinAgent.agent_code == agent_code))).scalar_one_or_none()
    if agent is None:
        raise AppError(msg="builtin_agent_not_found", code=404, status_code=404)

    pv = (
        await db.execute(
            select(BuiltinAgentPromptVersion).where(
                BuiltinAgentPromptVersion.builtin_agent_id == agent.id,
                BuiltinAgentPromptVersion.version == int(version),
            )
        )
    ).scalar_one_or_none()
    if pv is None:
        raise AppError(msg="builtin_agent_prompt_version_not_found", code=404, status_code=404)

    ai_model_config_id = pv.ai_model_config_id or agent.default_ai_model_config_id

    model_settings = dict(pv.meta or {})
    model_settings.pop("rollout", None)

    return BuiltinAgentResolvedVersion(
        agent_code=agent_code,
        version=int(version),
        system_prompt=pv.system_prompt or "",
        ai_model_config_id=ai_model_config_id,
        model_settings=model_settings,
    )
