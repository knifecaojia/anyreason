from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import AssetRead, AssetUpdate, AssetVariantCreate, AssetVariantUpdate
from app.schemas_response import ResponseBase
from app.services.asset_service import asset_service
from app.users import current_active_user


router = APIRouter()


@router.get("/assets/{asset_id}", response_model=ResponseBase[AssetRead])
async def get_asset(
    asset_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.get_asset_full(db=db, user_id=user.id, asset_id=asset_id)
    if not data:
        raise AppError(msg="Asset not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)


@router.patch("/assets/{asset_id}", response_model=ResponseBase[AssetRead])
async def update_asset(
    asset_id: UUID,
    body: AssetUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.update_asset(
        db=db,
        user_id=user.id,
        asset_id=asset_id,
        name=body.name,
        category=body.category,
        lifecycle_status=body.lifecycle_status,
        tags=body.tags,
    )
    if not data:
        raise AppError(msg="Asset not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/assets/{asset_id}/variants", response_model=ResponseBase[AssetRead])
async def create_asset_variant(
    asset_id: UUID,
    body: AssetVariantCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.create_variant(
        db=db,
        user_id=user.id,
        asset_id=asset_id,
        variant_code=body.variant_code,
        stage_tag=body.stage_tag,
        age_range=body.age_range,
        attributes=body.attributes,
        prompt_template=body.prompt_template,
        is_default=body.is_default,
    )
    if not data:
        raise AppError(msg="Asset not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)


@router.patch("/asset-variants/{variant_id}", response_model=ResponseBase[AssetRead])
async def update_asset_variant(
    variant_id: UUID,
    body: AssetVariantUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.update_variant(
        db=db,
        user_id=user.id,
        variant_id=variant_id,
        stage_tag=body.stage_tag,
        age_range=body.age_range,
        attributes=body.attributes,
        prompt_template=body.prompt_template,
        is_default=body.is_default,
    )
    if not data:
        raise AppError(msg="Asset variant not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)


@router.delete("/asset-variants/{variant_id}", response_model=ResponseBase[AssetRead])
async def delete_asset_variant(
    variant_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.delete_variant(db=db, user_id=user.id, variant_id=variant_id)
    if not data:
        raise AppError(msg="Asset variant not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)

