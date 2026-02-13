from __future__ import annotations

import difflib
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuiltinAgent, BuiltinAgentPromptVersion, BuiltinAgentUserOverride


class BuiltinAgentVersionService:
    async def list_builtin_agents(self, *, db: AsyncSession) -> list[BuiltinAgent]:
        rows = (await db.execute(select(BuiltinAgent).order_by(BuiltinAgent.agent_code.asc()))).scalars().all()
        return list(rows)

    async def get_builtin_agent(self, *, db: AsyncSession, agent_code: str) -> BuiltinAgent | None:
        return (
            await db.execute(select(BuiltinAgent).where(BuiltinAgent.agent_code == agent_code))
        ).scalar_one_or_none()

    async def list_versions(self, *, db: AsyncSession, agent_id: UUID) -> list[BuiltinAgentPromptVersion]:
        rows = (
            await db.execute(
                select(BuiltinAgentPromptVersion)
                .where(BuiltinAgentPromptVersion.builtin_agent_id == agent_id)
                .order_by(BuiltinAgentPromptVersion.version.desc())
            )
        ).scalars().all()
        return list(rows)

    async def create_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        system_prompt: str,
        ai_model_config_id: UUID | None,
        description: str | None,
        meta: dict,
        created_by: UUID | None,
    ) -> BuiltinAgentPromptVersion:
        max_version = (
            await db.execute(
                select(func.max(BuiltinAgentPromptVersion.version)).where(
                    BuiltinAgentPromptVersion.builtin_agent_id == agent_id
                )
            )
        ).scalar_one()
        next_version = int(max_version or 0) + 1
        row = BuiltinAgentPromptVersion(
            builtin_agent_id=agent_id,
            version=next_version,
            system_prompt=system_prompt,
            ai_model_config_id=ai_model_config_id,
            description=(description or "").strip() or None,
            is_default=False,
            created_by=created_by,
            meta=meta or {},
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def activate_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        version: int,
    ) -> BuiltinAgentPromptVersion:
        row = (
            await db.execute(
                select(BuiltinAgentPromptVersion).where(
                    BuiltinAgentPromptVersion.builtin_agent_id == agent_id,
                    BuiltinAgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")

        await db.execute(
            update(BuiltinAgentPromptVersion)
            .where(BuiltinAgentPromptVersion.builtin_agent_id == agent_id)
            .values(is_default=False)
        )
        row.is_default = True
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def override_user_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        user_id: UUID,
        version: int,
    ) -> BuiltinAgentUserOverride:
        existing = (
            await db.execute(
                select(BuiltinAgentUserOverride).where(
                    BuiltinAgentUserOverride.builtin_agent_id == agent_id,
                    BuiltinAgentUserOverride.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.version = version
            db.add(existing)
            await db.commit()
            await db.refresh(existing)
            return existing

        row = BuiltinAgentUserOverride(builtin_agent_id=agent_id, user_id=user_id, version=version)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def diff_versions(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        from_version: int,
        to_version: int,
    ) -> str:
        rows = (
            await db.execute(
                select(BuiltinAgentPromptVersion).where(
                    BuiltinAgentPromptVersion.builtin_agent_id == agent_id,
                    BuiltinAgentPromptVersion.version.in_([from_version, to_version]),
                )
            )
        ).scalars().all()
        by_version = {r.version: r for r in rows}
        a = by_version.get(from_version)
        b = by_version.get(to_version)
        if a is None or b is None:
            raise ValueError("version_not_found")

        diff_lines = difflib.unified_diff(
            (a.system_prompt or "").splitlines(),
            (b.system_prompt or "").splitlines(),
            fromfile=f"v{from_version}",
            tofile=f"v{to_version}",
            lineterm="",
        )
        return "\n".join(diff_lines)

    async def update_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        version: int,
        system_prompt: str | None,
        ai_model_config_id: UUID | None,
        ai_model_config_id_set: bool,
        description: str | None,
        meta: dict | None,
    ) -> BuiltinAgentPromptVersion:
        row = (
            await db.execute(
                select(BuiltinAgentPromptVersion).where(
                    BuiltinAgentPromptVersion.builtin_agent_id == agent_id,
                    BuiltinAgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")

        if system_prompt is not None:
            row.system_prompt = system_prompt
        if ai_model_config_id_set:
            row.ai_model_config_id = ai_model_config_id
        if description is not None:
            row.description = (description or "").strip() or None
        if meta is not None:
            row.meta = meta or {}

        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        version: int,
    ) -> None:
        row = (
            await db.execute(
                select(BuiltinAgentPromptVersion).where(
                    BuiltinAgentPromptVersion.builtin_agent_id == agent_id,
                    BuiltinAgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")
        if row.is_default:
            raise ValueError("cannot_delete_default_version")

        used = (
            await db.execute(
                select(func.count()).select_from(BuiltinAgentUserOverride).where(
                    BuiltinAgentUserOverride.builtin_agent_id == agent_id,
                    BuiltinAgentUserOverride.version == version,
                )
            )
        ).scalar_one()
        if int(used or 0) > 0:
            raise ValueError("version_in_use")

        await db.execute(
            delete(BuiltinAgentPromptVersion).where(
                BuiltinAgentPromptVersion.builtin_agent_id == agent_id,
                BuiltinAgentPromptVersion.version == version,
            )
        )
        await db.commit()

    async def update_builtin_agent_default_model(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        default_ai_model_config_id: UUID | None,
    ) -> BuiltinAgent:
        row = (await db.execute(select(BuiltinAgent).where(BuiltinAgent.id == agent_id))).scalar_one_or_none()
        if row is None:
            raise ValueError("builtin_agent_not_found")
        row.default_ai_model_config_id = default_ai_model_config_id
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


builtin_agent_version_service = BuiltinAgentVersionService()
