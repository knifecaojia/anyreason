from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BuiltinAgent,
    BuiltinAgentPromptVersion,
    BuiltinAgentUserOverride,
    UserAgent,
)


@dataclass(frozen=True)
class AgentRunConfig:
    system_prompt: str
    ai_model_config_id: UUID | None
    tools: list[str]
    model_settings: dict


def _stable_percent_bucket(*, user_id: UUID, salt: str) -> int:
    digest = hashlib.sha256(f"{salt}:{user_id}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], byteorder="big") % 100


def _rollout_match(*, rollout: dict, user_id: UUID) -> bool:
    strategy = rollout.get("strategy")
    if strategy != "percentage":
        return False
    try:
        percent = int(rollout.get("percent", 0))
    except Exception:
        return False
    salt = str(rollout.get("salt") or "")
    if percent <= 0:
        return False
    if percent >= 100:
        return True
    return _stable_percent_bucket(user_id=user_id, salt=salt) < percent


async def resolve_builtin_agent(
    *,
    session: AsyncSession,
    agent_code: str,
    user_id: UUID,
) -> AgentRunConfig:
    agent = (
        await session.execute(select(BuiltinAgent).where(BuiltinAgent.agent_code == agent_code))
    ).scalar_one_or_none()
    if agent is None:
        raise ValueError("builtin_agent_not_found")

    override = (
        await session.execute(
            select(BuiltinAgentUserOverride).where(
                BuiltinAgentUserOverride.builtin_agent_id == agent.id,
                BuiltinAgentUserOverride.user_id == user_id,
            )
        )
    ).scalar_one_or_none()

    versions = (
        await session.execute(
            select(BuiltinAgentPromptVersion)
            .where(BuiltinAgentPromptVersion.builtin_agent_id == agent.id)
            .order_by(BuiltinAgentPromptVersion.version.desc())
        )
    ).scalars().all()
    if not versions:
        raise ValueError("builtin_agent_prompt_versions_empty")

    selected: BuiltinAgentPromptVersion | None = None
    if override is not None:
        selected = next((v for v in versions if v.version == override.version), None)
        if selected is None:
            raise ValueError("builtin_agent_override_version_not_found")
    else:
        for v in versions:
            rollout = (v.meta or {}).get("rollout")
            if isinstance(rollout, dict) and _rollout_match(rollout=rollout, user_id=user_id):
                selected = v
                break

    if selected is None:
        selected = next((v for v in versions if bool(v.is_default)), None) or versions[0]

    model_settings = dict(selected.meta or {})
    model_settings.pop("rollout", None)

    return AgentRunConfig(
        system_prompt=selected.system_prompt,
        ai_model_config_id=selected.ai_model_config_id or agent.default_ai_model_config_id,
        tools=list(agent.tools or []),
        model_settings=model_settings,
    )


async def resolve_user_agent(
    *,
    session: AsyncSession,
    user_agent_id: UUID,
    user_id: UUID,
) -> AgentRunConfig:
    ua = (
        await session.execute(
            select(UserAgent).where(UserAgent.id == user_agent_id, UserAgent.user_id == user_id)
        )
    ).scalar_one_or_none()
    if ua is None:
        raise ValueError("user_agent_not_found")

    tools: list[str] = list(ua.tools or [])
    model_config_id = ua.ai_model_config_id

    if ua.base_builtin_agent_id is not None:
        base = (
            await session.execute(select(BuiltinAgent).where(BuiltinAgent.id == ua.base_builtin_agent_id))
        ).scalar_one_or_none()
        if base is not None:
            merged = []
            seen: set[str] = set()
            for t in list(base.tools or []) + tools:
                if t in seen:
                    continue
                seen.add(t)
                merged.append(t)
            tools = merged
            if model_config_id is None:
                model_config_id = base.default_ai_model_config_id

    model_settings: dict = {}
    if ua.temperature is not None:
        model_settings["temperature"] = float(ua.temperature)

    return AgentRunConfig(
        system_prompt=ua.system_prompt,
        ai_model_config_id=model_config_id,
        tools=tools,
        model_settings=model_settings,
    )
