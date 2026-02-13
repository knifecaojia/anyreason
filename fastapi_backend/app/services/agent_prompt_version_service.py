from __future__ import annotations

import difflib
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Agent, AgentPromptVersion


class AgentPromptVersionService:
    async def list_versions(self, *, db: AsyncSession, agent_id: UUID) -> list[AgentPromptVersion]:
        rows = (
            await db.execute(
                select(AgentPromptVersion)
                .where(AgentPromptVersion.agent_id == agent_id)
                .order_by(AgentPromptVersion.version.desc())
            )
        ).scalars().all()
        return list(rows)

    async def create_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        system_prompt: str | None,
        user_prompt_template: str | None,
        description: str | None,
        meta: dict,
        created_by: UUID | None,
    ) -> AgentPromptVersion:
        agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
        if agent is None:
            raise ValueError("agent_not_found")

        max_version = (
            await db.execute(
                select(func.max(AgentPromptVersion.version)).where(AgentPromptVersion.agent_id == agent_id)
            )
        ).scalar_one()
        next_version = int(max_version or 0) + 1
        is_first = max_version is None

        row = AgentPromptVersion(
            agent_id=agent_id,
            version=next_version,
            system_prompt=system_prompt,
            user_prompt_template=user_prompt_template,
            description=(description or "").strip() or None,
            is_default=bool(is_first),
            created_by=created_by,
            meta=meta or {},
        )
        db.add(row)

        if is_first:
            agent.system_prompt = system_prompt
            agent.user_prompt_template = user_prompt_template
            db.add(agent)

        await db.commit()
        await db.refresh(row)
        return row

    async def update_version(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        version: int,
        system_prompt: str | None,
        user_prompt_template: str | None,
        description: str | None,
        meta: dict | None,
    ) -> AgentPromptVersion:
        row = (
            await db.execute(
                select(AgentPromptVersion).where(
                    AgentPromptVersion.agent_id == agent_id,
                    AgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")

        if system_prompt is not None:
            row.system_prompt = system_prompt
        if user_prompt_template is not None:
            row.user_prompt_template = user_prompt_template
        if description is not None:
            row.description = (description or "").strip() or None
        if meta is not None:
            row.meta = meta or {}

        db.add(row)

        if row.is_default:
            agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one()
            agent.system_prompt = row.system_prompt
            agent.user_prompt_template = row.user_prompt_template
            db.add(agent)

        await db.commit()
        await db.refresh(row)
        return row

    async def activate_version(self, *, db: AsyncSession, agent_id: UUID, version: int) -> AgentPromptVersion:
        row = (
            await db.execute(
                select(AgentPromptVersion).where(
                    AgentPromptVersion.agent_id == agent_id,
                    AgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")

        await db.execute(
            update(AgentPromptVersion).where(AgentPromptVersion.agent_id == agent_id).values(is_default=False)
        )
        row.is_default = True
        db.add(row)

        agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one()
        agent.system_prompt = row.system_prompt
        agent.user_prompt_template = row.user_prompt_template
        db.add(agent)

        await db.commit()
        await db.refresh(row)
        return row

    async def delete_version(self, *, db: AsyncSession, agent_id: UUID, version: int) -> None:
        row = (
            await db.execute(
                select(AgentPromptVersion).where(
                    AgentPromptVersion.agent_id == agent_id,
                    AgentPromptVersion.version == version,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ValueError("version_not_found")
        if row.is_default:
            raise ValueError("cannot_delete_default_version")

        await db.execute(
            delete(AgentPromptVersion).where(
                AgentPromptVersion.agent_id == agent_id,
                AgentPromptVersion.version == version,
            )
        )
        await db.commit()

    async def diff_versions(self, *, db: AsyncSession, agent_id: UUID, from_version: int, to_version: int) -> str:
        rows = (
            await db.execute(
                select(AgentPromptVersion).where(
                    AgentPromptVersion.agent_id == agent_id,
                    AgentPromptVersion.version.in_([from_version, to_version]),
                )
            )
        ).scalars().all()
        by_version = {r.version: r for r in rows}
        a = by_version.get(from_version)
        b = by_version.get(to_version)
        if a is None or b is None:
            raise ValueError("version_not_found")

        out: list[str] = []

        def add_block(title: str, left: str | None, right: str | None):
            out.append(f"--- {title}: v{from_version}")
            out.append(f"+++ {title}: v{to_version}")
            diff_lines = difflib.unified_diff(
                (left or "").splitlines(),
                (right or "").splitlines(),
                fromfile=f"v{from_version}",
                tofile=f"v{to_version}",
                lineterm="",
            )
            out.extend(list(diff_lines))

        add_block("system_prompt", a.system_prompt, b.system_prompt)
        out.append("")
        add_block("user_prompt_template", a.user_prompt_template, b.user_prompt_template)
        return "\n".join(out).strip()


agent_prompt_version_service = AgentPromptVersionService()

