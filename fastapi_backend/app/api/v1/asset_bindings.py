from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Asset, AssetBinding, AssetVariant
from app.repositories import asset_binding_repository
from app.schemas import AssetBindingBrief, AssetBindingCreateRequest, StoryboardAssetBindingsResponse
from app.schemas_response import ResponseBase
from app.users import current_active_user


router = APIRouter()


def _to_brief(binding, asset, variant) -> AssetBindingBrief:
    return AssetBindingBrief(
        id=binding.id,
        asset_entity_id=asset.id,
        asset_variant_id=binding.asset_variant_id,
        name=asset.name,
        type=str(asset.type),
        category=asset.category,
        variant_code=getattr(variant, "variant_code", None) if variant is not None else None,
        stage_tag=getattr(variant, "stage_tag", None) if variant is not None else None,
        age_range=getattr(variant, "age_range", None) if variant is not None else None,
    )


@router.get("/episodes/{episode_id}/asset-bindings", response_model=ResponseBase[list[AssetBindingBrief]])
async def list_episode_asset_bindings(
    episode_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await asset_binding_repository.list_episode_bindings(db=db, user_id=user.id, episode_id=episode_id)
    if rows is None:
        raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=[_to_brief(b, a, v) for (b, a, v) in rows])


@router.post("/episodes/{episode_id}/asset-bindings", response_model=ResponseBase[AssetBindingBrief])
async def upsert_episode_asset_binding(
    episode_id: UUID,
    body: AssetBindingCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    binding = await asset_binding_repository.upsert_episode_binding(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        asset_entity_id=body.asset_entity_id,
        asset_variant_id=body.asset_variant_id,
    )
    if not binding:
        raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

    await db.commit()

    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.id == binding.id)
    )
    row = res.first()
    if not row:
        raise AppError(msg="Asset binding not found", code=404, status_code=404)
    b, a, v = row
    return ResponseBase(code=200, msg="OK", data=_to_brief(b, a, v))


@router.post("/episodes/{episode_id}/asset-bindings/batch", response_model=ResponseBase[list[AssetBindingBrief]])
async def upsert_episode_asset_bindings_batch(
    episode_id: UUID,
    body: list[AssetBindingCreateRequest],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    bindings_data = [{"asset_entity_id": str(b.asset_entity_id), "asset_variant_id": str(b.asset_variant_id) if b.asset_variant_id else None} for b in body]
    bindings = await asset_binding_repository.upsert_episode_bindings_batch(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        bindings=bindings_data,
    )
    if bindings is None:
        raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

    await db.commit()

    result = []
    for binding in bindings:
        res = await db.execute(
            select(AssetBinding, Asset, AssetVariant)
            .join(Asset, AssetBinding.asset_entity_id == Asset.id)
            .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
            .where(AssetBinding.id == binding.id)
        )
        row = res.first()
        if row:
            b, a, v = row
            result.append(_to_brief(b, a, v))
    
    return ResponseBase(code=200, msg="OK", data=result)


@router.get("/storyboards/{storyboard_id}/asset-bindings", response_model=ResponseBase[StoryboardAssetBindingsResponse])
async def list_storyboard_asset_bindings(
    storyboard_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await asset_binding_repository.list_storyboard_bindings(db=db, user_id=user.id, storyboard_id=storyboard_id)
    if rows is None:
        raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)
    return ResponseBase(
        code=200,
        msg="OK",
        data=StoryboardAssetBindingsResponse(
            storyboard_id=storyboard_id,
            bindings=[_to_brief(b, a, v) for (b, a, v) in rows],
        ),
    )


@router.post("/storyboards/{storyboard_id}/asset-bindings", response_model=ResponseBase[AssetBindingBrief])
async def upsert_storyboard_asset_binding(
    storyboard_id: UUID,
    body: AssetBindingCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    binding = await asset_binding_repository.upsert_storyboard_binding(
        db=db,
        user_id=user.id,
        storyboard_id=storyboard_id,
        asset_entity_id=body.asset_entity_id,
        asset_variant_id=body.asset_variant_id,
    )
    if not binding:
        raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)

    await db.commit()

    res = await db.execute(
        select(AssetBinding, Asset, AssetVariant)
        .join(Asset, AssetBinding.asset_entity_id == Asset.id)
        .outerjoin(AssetVariant, AssetBinding.asset_variant_id == AssetVariant.id)
        .where(AssetBinding.id == binding.id)
    )
    row = res.first()
    if not row:
        raise AppError(msg="Asset binding not found", code=404, status_code=404)
    b, a, v = row
    return ResponseBase(code=200, msg="OK", data=_to_brief(b, a, v))


@router.delete("/asset-bindings/{binding_id}", response_model=ResponseBase[dict])
async def delete_asset_binding(
    binding_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ok = await asset_binding_repository.delete_binding(db=db, user_id=user.id, binding_id=binding_id)
    if not ok:
        raise AppError(msg="Asset binding not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"message": "Asset binding successfully deleted"})
