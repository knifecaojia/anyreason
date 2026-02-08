from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import shot_repository


class ShotService:
    async def list_scene_shots(self, *, db: AsyncSession, user_id: UUID, scene_id: UUID):
        return await shot_repository.list_scene_shots(db=db, user_id=user_id, scene_id=scene_id)

    async def delete_shot(self, *, db: AsyncSession, user_id: UUID, shot_id: UUID) -> bool:
        return await shot_repository.delete_shot(db=db, user_id=user_id, shot_id=shot_id)


shot_service = ShotService()

