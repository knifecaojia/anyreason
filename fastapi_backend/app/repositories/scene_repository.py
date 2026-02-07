from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.models import Episode, Project, Scene, Script


async def _get_episode_for_user(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> Episode | None:
    result = await db.execute(
        select(Episode)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Episode.id == episode_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    return result.scalars().first()


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


async def create_scene(
    *,
    db: AsyncSession,
    user_id: UUID,
    episode_id: UUID,
    title: str | None,
    content: str | None,
    location: str | None,
    time_of_day: str | None,
) -> Scene | None:
    episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
    if not episode:
        return None

    max_res = await db.execute(select(func.coalesce(func.max(Scene.scene_number), 0)).where(Scene.episode_id == episode.id))
    next_num = int(max_res.scalar_one() or 0) + 1
    scene_code = f"EP{episode.episode_number:03d}_SC{next_num:02d}"

    scene = Scene(
        episode_id=episode.id,
        scene_code=scene_code,
        scene_number=next_num,
        title=title,
        content=content,
        location=location,
        time_of_day=time_of_day,
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


async def update_scene(
    *,
    db: AsyncSession,
    user_id: UUID,
    scene_id: UUID,
    title: str | None,
    content: str | None,
    location: str | None,
    time_of_day: str | None,
) -> Scene | None:
    scene = await _get_scene_for_user(db=db, user_id=user_id, scene_id=scene_id)
    if not scene:
        return None

    if title is not None:
        scene.title = title
    if content is not None:
        scene.content = content
    if location is not None:
        scene.location = location
    if time_of_day is not None:
        scene.time_of_day = time_of_day

    await db.commit()
    await db.refresh(scene)
    return scene


async def delete_scene(*, db: AsyncSession, user_id: UUID, scene_id: UUID) -> bool:
    scene = await _get_scene_for_user(db=db, user_id=user_id, scene_id=scene_id)
    if not scene:
        return False
    await db.delete(scene)
    await db.commit()
    return True

