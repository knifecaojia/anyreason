from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import ItemCreate, ItemRead
from app.schemas_response import ResponseBase
from app.services.item_service import item_service
from app.users import current_active_user


router = APIRouter()


@router.get("/", response_model=ResponseBase[Page[ItemRead]])
async def list_items(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    params = Params(page=page, size=size)
    data = await item_service.list_user_items(db=db, user_id=user.id, params=params)
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/", response_model=ResponseBase[ItemRead])
async def create_item(
    item: ItemCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created = await item_service.create_item(db=db, user_id=user.id, item=item)
    return ResponseBase(code=200, msg="OK", data=ItemRead.model_validate(created))


@router.delete("/{item_id}", response_model=ResponseBase[dict])
async def delete_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await item_service.delete_item(db=db, user_id=user.id, item_id=item_id)
    if not deleted:
        raise AppError(msg="Item not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"message": "Item successfully deleted"})
