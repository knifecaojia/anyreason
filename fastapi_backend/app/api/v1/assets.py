from __future__ import annotations

from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import AssetRead, AssetResourceCreateRequest, AssetUpdate, AssetVariantCreate, AssetVariantUpdate, AssetCreate
from app.schemas_response import ResponseBase
from app.services.asset_service import asset_service
from app.storage.minio_client import get_minio_client
from app.users import current_active_user


router = APIRouter()


@router.post("/assets", response_model=ResponseBase[AssetRead])
async def create_asset(
    body: AssetCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    pid = body.project_id
    # If script_id is present but project_id is not, assume project_id = script_id
    if not pid and body.script_id:
        pid = body.script_id
        
    data = await asset_service.create_asset(
        db=db,
        user_id=user.id,
        name=body.name,
        type=body.type,
        project_id=pid,
        script_id=body.script_id,
        category=body.category,
        source=body.source,
    )
    if not data:
        # If created but not retrieved (e.g. project mismatch or permissions), we return error or partial success?
        # But create_asset logic in service returns get_asset_full which checks permissions.
        # If project_id is None, it returns None.
        if not pid:
             # Maybe we should allow returning just the created object without full check if it's public?
             # But we need AssetRead format.
             pass
        raise AppError(msg="Asset created but could not be retrieved (Project ID required?)", code=500, status_code=500)
    return ResponseBase(code=200, msg="OK", data=data)


@router.get("/assets", response_model=ResponseBase[list[AssetRead]])
async def list_assets(
    project_id: UUID | None = None,
    script_id: UUID | None = None,
    source: str | None = None,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.list_assets(
        db=db,
        user_id=user.id,
        project_id=project_id,
        script_id=script_id,
        source=source
    )
    return ResponseBase(code=200, msg="OK", data=data)


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


@router.get("/assets/{asset_id}/resources/{resource_id}/download")
async def download_asset_resource(
    asset_id: UUID,
    resource_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    resource = await asset_service.get_resource_for_download(
        db=db,
        user_id=user.id,
        asset_id=asset_id,
        resource_id=resource_id,
    )
    if not resource:
        raise AppError(msg="Resource not found or not authorized", code=404, status_code=404)

    client = get_minio_client()
    try:
        obj = await run_in_threadpool(
            lambda: client.get_object(resource.minio_bucket, resource.minio_key)
        )
    except Exception:
        raise AppError(msg="对象存储读取失败", code=500, status_code=500)

    # 尝试从元数据获取文件名，否则使用 ID
    meta = resource.meta_data or {}
    filename = meta.get("file_name") or f"{resource.id}"
    content_type = meta.get("content_type") or "application/octet-stream"
    
    # 构建 Content-Disposition 头，支持 UTF-8 文件名
    disposition = f"attachment; filename*=UTF-8''{quote(filename)}"

    def iterator():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        iterator(),
        media_type=content_type,
        headers={"Content-Disposition": disposition},
    )


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


@router.post("/assets/{asset_id}/resources", response_model=ResponseBase[AssetRead])
async def create_asset_resources(
    asset_id: UUID,
    body: AssetResourceCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.create_resources(
        db=db,
        user_id=user.id,
        asset_id=asset_id,
        file_node_ids=body.file_node_ids,
        res_type=body.res_type,
        variant_id=body.variant_id,
        cover_file_node_id=body.cover_file_node_id,
    )
    if not data:
        raise AppError(msg="Asset not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)
