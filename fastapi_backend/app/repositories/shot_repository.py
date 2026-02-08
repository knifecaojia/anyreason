from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, Project, Scene, Script, Shot


async def _get_scene_for_user(*, db: AsyncSession, user_id: UUID, scene_id: UUID) -> Scene | None:
    result = await db.execute(
        select(Scene)
        .join(Episode, Scene.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Scene.id == scene_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    return result.scalars().first()


async def _get_shot_scene_episode_for_user(
    *,
    db: AsyncSession,
    user_id: UUID,
    shot_id: UUID,
) -> tuple[Shot, Scene, Episode] | None:
    result = await db.execute(
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
    row = result.first()
    if not row:
        return None
    shot, scene, episode = row
    return shot, scene, episode


async def list_scene_shots(*, db: AsyncSession, user_id: UUID, scene_id: UUID) -> list[Shot] | None:
    scene = await _get_scene_for_user(db=db, user_id=user_id, scene_id=scene_id)
    if not scene:
        return None
    res = await db.execute(select(Shot).where(Shot.scene_id == scene.id).order_by(Shot.shot_number.asc()))
    return list(res.scalars().all())


async def delete_shot(*, db: AsyncSession, user_id: UUID, shot_id: UUID) -> bool:
    pair = await _get_shot_scene_episode_for_user(db=db, user_id=user_id, shot_id=shot_id)
    if not pair:
        return False
    shot, scene, episode = pair

    await db.delete(shot)
    await db.flush()

    res = await db.execute(select(Shot).where(Shot.scene_id == scene.id).order_by(Shot.shot_number.asc(), Shot.created_at.asc()))
    remaining = list(res.scalars().all())

    for s in remaining:
        s.shot_code = f"TMP_{s.id}"
    await db.flush()

    for idx, s in enumerate(remaining, start=1):
        s.shot_number = idx
        s.shot_code = f"EP{episode.episode_number:03d}_SC{scene.scene_number:02d}_SH{idx:02d}"

    await db.commit()
    return True
