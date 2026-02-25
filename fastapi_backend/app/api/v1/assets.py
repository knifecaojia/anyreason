from __future__ import annotations

from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import FileNode
from app.schemas import AssetRead, AssetResourceCreateRequest, AssetUpdate, AssetVariantCreate, AssetVariantUpdate, AssetCreate, AssetResourceCheckRequest, AssetResourceCheckResponse
from app.schemas_response import ResponseBase
from app.services.asset_service import asset_service
from app.services.storage.vfs_service import vfs_service
from app.storage.minio_client import get_minio_client
from app.users import current_active_user
from app.vfs_layout import ASSETS_FOLDER_NAME, ASSET_TYPE_FOLDER_NAMES, asset_doc_filename
from app.vfs_renderers.asset_doc_renderer import render_asset_doc_md
from app.vfs_docs import AssetDocV2


router = APIRouter()


# ── VFS doc helper ──────────────────────────────────────────────

# Map DB asset types to the folder-name keys used in ASSET_TYPE_FOLDER_NAMES
_TYPE_TO_FOLDER_KEY: dict[str, str] = {
    "character": "character",
    "scene": "location",   # DB uses "scene", VFS folders use "location"
    "prop": "prop",
    "vfx": "vfx",
}


async def _get_or_create_folder(
    *, db: AsyncSession, user_id: UUID, project_id: UUID,
    parent_id: UUID | None, name: str,
) -> UUID:
    """Return existing folder id or create one."""
    q = select(FileNode).where(
        FileNode.project_id == project_id,
        FileNode.is_folder.is_(True),
        FileNode.name == name,
    )
    if parent_id is None:
        q = q.where(FileNode.parent_id.is_(None))
    else:
        q = q.where(FileNode.parent_id == parent_id)
    found = (await db.execute(q)).scalars().first()
    if found:
        return found.id
    created = await vfs_service.create_folder(
        db=db, user_id=user_id, name=name,
        parent_id=parent_id, workspace_id=None, project_id=project_id,
    )
    return created.id


async def _create_asset_vfs_doc(
    *, db: AsyncSession, user_id: UUID, project_id: UUID,
    asset_type: str, asset_name: str, content_md: str,
) -> UUID | None:
    """Create a VFS markdown document for a manually-created asset.

    Returns the FileNode id (doc_node_id) or None on failure.
    """
    folder_key = _TYPE_TO_FOLDER_KEY.get(asset_type, asset_type)
    folder_name = ASSET_TYPE_FOLDER_NAMES.get(folder_key)
    if not folder_name:
        return None

    assets_root_id = await _get_or_create_folder(
        db=db, user_id=user_id, project_id=project_id,
        parent_id=None, name=ASSETS_FOLDER_NAME,
    )
    type_folder_id = await _get_or_create_folder(
        db=db, user_id=user_id, project_id=project_id,
        parent_id=assets_root_id, name=folder_name,
    )

    doc = AssetDocV2(
        type=folder_key,  # type: ignore[arg-type]
        name=asset_name,
        details_md=content_md,
        provenance={"source": "manual"},
    )
    md_filename = asset_doc_filename(asset_type=folder_key, name=asset_name)
    md_content = render_asset_doc_md(doc=doc)

    md_node = await vfs_service.upsert_text_file(
        db=db, user_id=user_id,
        name=md_filename, content=md_content,
        parent_id=type_folder_id,
        workspace_id=None, project_id=project_id,
        content_type="text/markdown; charset=utf-8",
    )
    return md_node.id


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

    doc_node_id = None
    # When markdown content is provided, persist it as a VFS document
    if body.content_md and pid:
        doc_node_id = await _create_asset_vfs_doc(
            db=db,
            user_id=user.id,
            project_id=pid,
            asset_type=body.type,
            asset_name=body.name,
            content_md=body.content_md,
        )

    data = await asset_service.create_asset(
        db=db,
        user_id=user.id,
        name=body.name,
        type=body.type,
        project_id=pid,
        script_id=body.script_id,
        category=body.category,
        source=body.source,
        doc_node_id=doc_node_id,
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


@router.post("/assets/{asset_id}/resources/check", response_model=ResponseBase[AssetResourceCheckResponse])
async def check_asset_resources(
    asset_id: UUID,
    body: AssetResourceCheckRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await asset_service.check_resources(
        db=db,
        user_id=user.id,
        asset_id=asset_id,
        resource_ids=body.resource_ids,
    )
    return ResponseBase(code=200, msg="OK", data=result)


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


@router.patch("/assets/{asset_id}/resources/{resource_id}/cover", response_model=ResponseBase[AssetRead])
async def set_asset_resource_cover(
    asset_id: UUID,
    resource_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    data = await asset_service.set_cover(
        db=db,
        user_id=user.id,
        resource_id=resource_id,
    )
    if not data:
        raise AppError(msg="Asset or resource not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=data)
