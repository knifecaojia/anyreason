from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, AssetBinding, AssetVariant, Episode, Project, Scene, Script, Shot


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


async def _ensure_scene_for_user(*, db: AsyncSession, user_id: UUID, scene_id: UUID) -> tuple[Scene, Episode] | None:
    res = await db.execute(
        select(Scene, Episode)
        .join(Episode, Scene.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Scene.id == scene_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    row = res.first()
    if not row:
        return None
    scene, episode = row
    return scene, episode


async def _ensure_shot_for_user(*, db: AsyncSession, user_id: UUID, shot_id: UUID) -> tuple[Shot, Scene, Episode] | None:
    res = await db.execute(
        select(Shot, Scene, Episode)
        .join(Scene, Shot.scene_id == Scene.id)
        .join(Episode, Scene.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Shot.id == shot_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    row = res.first()
    if not row:
        return None
    shot, scene, episode = row
    return shot, scene, episode


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


async def list_scene_bindings(*, db: AsyncSession, user_id: UUID, scene_id: UUID) -> list[tuple[AssetBinding, Asset, AssetVariant | None]] | None:
    pair = await _ensure_scene_for_user(db=db, user_id=user_id, scene_id=scene_id)
    if not pair:
        return None
    scene, _ep = pair
    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.scene_id == scene.id)
        .order_by(Asset.type.asc(), Asset.asset_id.asc())
    )
    return list(res.all())


async def list_shot_bindings_map_for_scene(
    *,
    db: AsyncSession,
    user_id: UUID,
    scene_id: UUID,
) -> dict[UUID, list[tuple[AssetBinding, Asset, AssetVariant | None]]] | None:
    pair = await _ensure_scene_for_user(db=db, user_id=user_id, scene_id=scene_id)
    if not pair:
        return None
    scene, _ep = pair

    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.shot_id.is_not(None))
        .where(AssetBinding.scene_id.is_(None))
        .where(AssetBinding.episode_id.is_(None))
        .where(AssetBinding.shot_id.in_(select(Shot.id).where(Shot.scene_id == scene.id)))
        .order_by(AssetBinding.shot_id.asc(), Asset.type.asc(), Asset.asset_id.asc())
    )
    out: dict[UUID, list[tuple[AssetBinding, Asset, AssetVariant | None]]] = {}
    for binding, asset, variant in res.all():
        out.setdefault(binding.shot_id, []).append((binding, asset, variant))
    return out


async def upsert_shot_binding(
    *,
    db: AsyncSession,
    user_id: UUID,
    shot_id: UUID,
    asset_entity_id: UUID,
    asset_variant_id: UUID | None,
) -> AssetBinding | None:
    pair = await _ensure_shot_for_user(db=db, user_id=user_id, shot_id=shot_id)
    if not pair:
        return None
    shot, scene, _episode = pair

    existing_res = await db.execute(
        select(AssetBinding).where(AssetBinding.shot_id == shot.id, AssetBinding.asset_entity_id == asset_entity_id)
    )
    existing = existing_res.scalars().first()
    if existing:
        existing.asset_variant_id = asset_variant_id
        await db.flush()
        return existing

    row = AssetBinding(
        asset_entity_id=asset_entity_id,
        asset_variant_id=asset_variant_id,
        shot_id=shot.id,
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

