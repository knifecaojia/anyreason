from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas import ItemRead, ItemCreate
from app.users import current_active_user
from app.services.item_service import item_service

router = APIRouter(tags=["item"])


def transform_items(items):
    return [ItemRead.model_validate(item) for item in items]


@router.get("/", response_model=Page[ItemRead])
async def read_item(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(10, ge=1, le=100, description="Page size"),
):
    params = Params(page=page, size=size)
    return await item_service.list_user_items(db=db, user_id=user.id, params=params)


@router.post("/", response_model=ItemRead)
async def create_item(
    item: ItemCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created = await item_service.create_item(db=db, user_id=user.id, item=item)
    return created


@router.delete("/{item_id}")
async def delete_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await item_service.delete_item(db=db, user_id=user.id, item_id=item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item not found or not authorized")
    return {"message": "Item successfully deleted"}
