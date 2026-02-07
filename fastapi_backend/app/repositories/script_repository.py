from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi_pagination import Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Script
from app.schemas import ScriptRead


def _transform_scripts(items):
    return [ScriptRead.model_validate(item) for item in items]


async def list_user_scripts(*, db: AsyncSession, user_id: UUID, params: Params):
    query = (
        select(Script)
        .filter(Script.owner_id == user_id, Script.is_deleted.is_(False))
        .order_by(Script.created_at.desc())
    )
    return await apaginate(db, query, params, transformer=_transform_scripts)


async def get_user_script(*, db: AsyncSession, user_id: UUID, script_id: UUID) -> Script | None:
    result = await db.execute(
        select(Script).filter(
            Script.id == script_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    return result.scalars().first()


async def create_script(*, db: AsyncSession, script: Script) -> Script:
    db.add(script)
    await db.commit()
    await db.refresh(script)
    return script


async def soft_delete_script(*, db: AsyncSession, user_id: UUID, script_id: UUID) -> bool:
    result = await db.execute(
        select(Script).filter(
            Script.id == script_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    script = result.scalars().first()
    if not script:
        return False
    script.is_deleted = True
    script.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return True
