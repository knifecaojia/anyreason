from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIPromptPreset


async def list_presets(*, db: AsyncSession, user_id: UUID, tool_key: str | None):
    query = select(AIPromptPreset).where(AIPromptPreset.user_id == user_id)
    if tool_key:
        query = query.where(AIPromptPreset.tool_key == tool_key)
    query = query.order_by(AIPromptPreset.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def get_preset(*, db: AsyncSession, user_id: UUID, preset_id: UUID) -> AIPromptPreset | None:
    result = await db.execute(
        select(AIPromptPreset).where(AIPromptPreset.id == preset_id, AIPromptPreset.user_id == user_id)
    )
    return result.scalars().first()


async def create_preset(
    *,
    db: AsyncSession,
    user_id: UUID,
    tool_key: str,
    name: str,
    provider: str | None,
    model: str | None,
    prompt_template: str,
    is_default: bool,
) -> AIPromptPreset:
    preset = AIPromptPreset(
        user_id=user_id,
        tool_key=tool_key,
        name=name,
        provider=provider,
        model=model,
        prompt_template=prompt_template,
        is_default=is_default,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


async def unset_default_for_tool(*, db: AsyncSession, user_id: UUID, tool_key: str):
    await db.execute(
        update(AIPromptPreset)
        .where(AIPromptPreset.user_id == user_id, AIPromptPreset.tool_key == tool_key, AIPromptPreset.is_default.is_(True))
        .values(is_default=False)
    )


async def update_preset(
    *,
    db: AsyncSession,
    preset: AIPromptPreset,
    patch: dict,
) -> AIPromptPreset:
    for k, v in patch.items():
        setattr(preset, k, v)
    preset.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(preset)
    return preset


async def delete_preset(*, db: AsyncSession, user_id: UUID, preset_id: UUID) -> bool:
    result = await db.execute(
        delete(AIPromptPreset).where(AIPromptPreset.id == preset_id, AIPromptPreset.user_id == user_id)
    )
    await db.commit()
    return bool(result.rowcount and result.rowcount > 0)
