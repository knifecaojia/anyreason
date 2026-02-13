from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserAgent


class UserAgentService:
    async def list_for_user(self, *, db: AsyncSession, user_id: UUID) -> list[UserAgent]:
        rows = (
            await db.execute(select(UserAgent).where(UserAgent.user_id == user_id).order_by(UserAgent.created_at.desc()))
        ).scalars().all()
        return list(rows)

    async def get_for_user(self, *, db: AsyncSession, user_id: UUID, user_agent_id: UUID) -> UserAgent | None:
        return (
            await db.execute(select(UserAgent).where(UserAgent.id == user_agent_id, UserAgent.user_id == user_id))
        ).scalar_one_or_none()

    async def create(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        description: str | None,
        base_builtin_agent_id: UUID | None,
        system_prompt: str,
        ai_model_config_id: UUID | None,
        temperature: float | None,
        tools: list[str],
        is_public: bool,
    ) -> UserAgent:
        now = datetime.now(timezone.utc)
        row = UserAgent(
            user_id=user_id,
            workspace_id=None,
            agent_code=None,
            name=name.strip(),
            description=(description or "").strip() or None,
            base_builtin_agent_id=base_builtin_agent_id,
            system_prompt=system_prompt,
            ai_model_config_id=ai_model_config_id,
            temperature=temperature,
            tools=list(tools or []),
            is_public=bool(is_public),
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def update(
        self,
        *,
        db: AsyncSession,
        row: UserAgent,
        patch: dict,
    ) -> UserAgent:
        if "name" in patch:
            row.name = str(patch["name"] or "").strip()
        if "description" in patch:
            row.description = (str(patch["description"] or "").strip() or None) if patch["description"] is not None else None
        if "base_builtin_agent_id" in patch:
            row.base_builtin_agent_id = patch["base_builtin_agent_id"]
        if "system_prompt" in patch:
            row.system_prompt = str(patch["system_prompt"] or "")
        if "ai_model_config_id" in patch:
            row.ai_model_config_id = patch["ai_model_config_id"]
        if "temperature" in patch:
            row.temperature = patch["temperature"]
        if "tools" in patch:
            row.tools = list(patch["tools"] or [])
        if "is_public" in patch:
            row.is_public = bool(patch["is_public"])

        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete(self, *, db: AsyncSession, row: UserAgent) -> None:
        await db.delete(row)
        await db.commit()


user_agent_service = UserAgentService()
