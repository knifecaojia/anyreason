from __future__ import annotations

from uuid import UUID

from fastapi_pagination import Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import item_repository
from app.schemas import ItemCreate


class ItemService:
    async def list_user_items(self, *, db: AsyncSession, user_id: UUID, params: Params):
        return await item_repository.list_user_items(db=db, user_id=user_id, params=params)

    async def create_item(self, *, db: AsyncSession, user_id: UUID, item: ItemCreate):
        return await item_repository.create_item(
            db=db, user_id=user_id, item_data=item.model_dump()
        )

    async def delete_item(self, *, db: AsyncSession, user_id: UUID, item_id: UUID) -> bool:
        return await item_repository.delete_item(db=db, user_id=user_id, item_id=item_id)


item_service = ItemService()

