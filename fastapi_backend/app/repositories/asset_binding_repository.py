from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, AssetBinding, AssetVariant, Episode, Project, Storyboard, Script


async def _ensure_episode_for_user(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> Episode | None:
    res = await db.execute(
        select(Episode)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Episode.id == episode_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    return res.scalars().first()


async def _ensure_storyboard_for_user(*, db: AsyncSession, user_id: UUID, storyboard_id: UUID) -> tuple[Storyboard, Episode] | None:
    res = await db.execute(
        select(Storyboard, Episode)
        .join(Episode, Storyboard.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Storyboard.id == storyboard_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    row = res.first()
    if not row:
        return None
    storyboard, episode = row
    return storyboard, episode


async def list_episode_bindings(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> list[tuple[AssetBinding, Asset, AssetVariant | None]] | None:
    ep = await _ensure_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
    if not ep:
        return None
    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.episode_id == ep.id)
        .order_by(Asset.type.asc(), Asset.asset_id.asc())
    )
    return list(res.all())


async def list_storyboard_bindings(*, db: AsyncSession, user_id: UUID, storyboard_id: UUID) -> list[tuple[AssetBinding, Asset, AssetVariant | None]] | None:
    pair = await _ensure_storyboard_for_user(db=db, user_id=user_id, storyboard_id=storyboard_id)
    if not pair:
        return None
    storyboard, _ep = pair
    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.storyboard_id == storyboard.id)
        .order_by(Asset.type.asc(), Asset.asset_id.asc())
    )
    return list(res.all())


async def upsert_storyboard_binding(
    *,
    db: AsyncSession,
    user_id: UUID,
    storyboard_id: UUID,
    asset_entity_id: UUID,
    asset_variant_id: UUID | None,
) -> AssetBinding | None:
    pair = await _ensure_storyboard_for_user(db=db, user_id=user_id, storyboard_id=storyboard_id)
    if not pair:
        return None
    storyboard, _episode = pair

    existing_res = await db.execute(
        select(AssetBinding).where(AssetBinding.storyboard_id == storyboard.id, AssetBinding.asset_entity_id == asset_entity_id)
    )
    existing = existing_res.scalars().first()
    if existing:
        existing.asset_variant_id = asset_variant_id
        await db.flush()
        return existing

    row = AssetBinding(
        asset_entity_id=asset_entity_id,
        asset_variant_id=asset_variant_id,
        storyboard_id=storyboard.id,
    )
    db.add(row)
    await db.flush()
    return row


async def delete_binding(*, db: AsyncSession, user_id: UUID, binding_id: UUID) -> bool:
    res = await db.execute(
        select(AssetBinding)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .join(Project, Asset.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            AssetBinding.id == binding_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    binding = res.scalars().first()
    if not binding:
        return False
    await db.delete(binding)
    await db.commit()
    return True

