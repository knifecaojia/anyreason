from __future__ import annotations

from uuid import UUID

from fastapi_pagination import Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item
from app.schemas import ItemRead


def _transform_items(items):
    return [ItemRead.model_validate(item) for item in items]


async def list_user_items(*, db: AsyncSession, user_id: UUID, params: Params):
    query = select(Item).filter(Item.user_id == user_id)
    return await apaginate(db, query, params, transformer=_transform_items)


async def create_item(*, db: AsyncSession, user_id: UUID, item_data: dict) -> Item:
    item = Item(**item_data, user_id=user_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(*, db: AsyncSession, user_id: UUID, item_id: UUID) -> bool:
    result = await db.execute(
        select(Item).filter(Item.id == item_id, Item.user_id == user_id)
    )
    item = result.scalars().first()
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True

