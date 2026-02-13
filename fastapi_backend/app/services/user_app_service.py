from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserApp


class UserAppService:
    async def list_for_user(self, *, db: AsyncSession, user_id: UUID) -> list[UserApp]:
        rows = (
            await db.execute(select(UserApp).where(UserApp.user_id == user_id).order_by(UserApp.created_at.desc()))
        ).scalars().all()
        return list(rows)

    async def get_for_user(self, *, db: AsyncSession, user_id: UUID, app_id: UUID) -> UserApp | None:
        return (await db.execute(select(UserApp).where(UserApp.id == app_id, UserApp.user_id == user_id))).scalar_one_or_none()

    async def create(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        description: str | None,
        icon: str | None,
        flow_definition: dict,
        trigger_type: str,
        input_template: dict,
        output_template: dict,
        is_active: bool,
    ) -> UserApp:
        now = datetime.now(timezone.utc)
        row = UserApp(
            user_id=user_id,
            workspace_id=None,
            name=name.strip(),
            description=(description or "").strip() or None,
            icon=(icon or "").strip() or None,
            flow_definition=flow_definition or {},
            trigger_type=(trigger_type or "manual").strip() or "manual",
            input_template=input_template or {},
            output_template=output_template or {},
            is_active=bool(is_active),
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def update(self, *, db: AsyncSession, row: UserApp, patch: dict) -> UserApp:
        if "name" in patch:
            row.name = str(patch["name"] or "").strip()
        if "description" in patch:
            row.description = (str(patch["description"] or "").strip() or None) if patch["description"] is not None else None
        if "icon" in patch:
            row.icon = (str(patch["icon"] or "").strip() or None) if patch["icon"] is not None else None
        if "flow_definition" in patch:
            row.flow_definition = patch["flow_definition"] or {}
        if "trigger_type" in patch:
            row.trigger_type = (str(patch["trigger_type"] or "manual").strip() or "manual")
        if "input_template" in patch:
            row.input_template = patch["input_template"] or {}
        if "output_template" in patch:
            row.output_template = patch["output_template"] or {}
        if "is_active" in patch:
            row.is_active = bool(patch["is_active"])

        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete(self, *, db: AsyncSession, row: UserApp) -> None:
        await db.delete(row)
        await db.commit()


user_app_service = UserAppService()

