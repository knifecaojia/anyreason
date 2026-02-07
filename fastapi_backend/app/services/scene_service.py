from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import scene_repository


class SceneService:
    async def create_scene(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        episode_id: UUID,
        title: str | None,
        content: str | None,
        location: str | None,
        time_of_day: str | None,
    ):
        return await scene_repository.create_scene(
            db=db,
            user_id=user_id,
            episode_id=episode_id,
            title=title,
            content=content,
            location=location,
            time_of_day=time_of_day,
        )

    async def update_scene(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        scene_id: UUID,
        title: str | None,
        content: str | None,
        location: str | None,
        time_of_day: str | None,
    ):
        return await scene_repository.update_scene(
            db=db,
            user_id=user_id,
            scene_id=scene_id,
            title=title,
            content=content,
            location=location,
            time_of_day=time_of_day,
        )

    async def delete_scene(self, *, db: AsyncSession, user_id: UUID, scene_id: UUID) -> bool:
        return await scene_repository.delete_scene(db=db, user_id=user_id, scene_id=scene_id)


scene_service = SceneService()

