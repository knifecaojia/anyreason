"""Canvas CRUD API — M2.2 / M3.2

Endpoints:
  POST   /canvases              — create canvas (user-level, no project)
  GET    /canvases              — list user's canvases (status filter, name search)
  GET    /canvases/{id}         — get canvas detail
  PATCH  /canvases/{id}         — update canvas (name, description, status)
  DELETE /canvases/{id}         — soft-delete (status → archived)
  GET    /canvases/{id}/nodes   — list canvas nodes
  PUT    /canvases/{id}/nodes   — batch upsert nodes (idempotent by frontend_node_id)
  DELETE /canvases/{id}/nodes/{frontend_node_id} — delete a single node
  POST   /canvases/{id}/execute — batch execute canvas nodes (M3.2)
  GET    /canvases/{id}/executions — list execution history
"""
from __future__ import annotations

import base64
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import paginate
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Asset, Canvas, CanvasExecution, CanvasNode, Episode, FileNode, Project, Storyboard
from app.schemas import (
    CanvasCreate,
    CanvasExecutionRead,
    CanvasNodeRead,
    CanvasNodeUpsert,
    CanvasRead,
    CanvasUpdate,
    TaskCreateRequest,
    TaskRead,
)
from app.schemas_response import ResponseBase
from app.services.task_service import task_service
from app.users import current_active_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_canvas(
    db: AsyncSession, canvas_id: UUID, user_id: UUID,
) -> Canvas:
    """Fetch a canvas owned by the given user, or raise 404."""
    result = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id, Canvas.user_id == user_id)
    )
    canvas = result.scalar_one_or_none()
    if canvas is None:
        raise AppError(msg="画布不存在或无权访问", code=404, status_code=404)
    return canvas


# ---------------------------------------------------------------------------
# Canvas CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ResponseBase[CanvasRead])
async def create_canvas(
    body: CanvasCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    canvas = Canvas(
        name=body.name,
        description=body.description,
        user_id=user.id,
        status="draft",
    )
    db.add(canvas)
    await db.flush()
    await db.refresh(canvas)
    await db.commit()
    return ResponseBase(data=CanvasRead.model_validate(canvas))


@router.get("", response_model=ResponseBase[Page[CanvasRead]])
async def list_canvases(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    status: str | None = Query(None, description="Filter by status: draft|active|archived"),
    q: str | None = Query(None, description="Search by name (case-insensitive contains)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    stmt = select(Canvas).where(
        Canvas.user_id == user.id,
        Canvas.status != "archived",
    ).order_by(Canvas.updated_at.desc())

    if status:
        stmt = stmt.where(Canvas.status == status)
    if q:
        stmt = stmt.where(Canvas.name.ilike(f"%{q}%"))

    params = Params(page=page, size=size)
    data = await paginate(db, stmt, params)
    return ResponseBase(data=data)


@router.get("/{canvas_id}", response_model=ResponseBase[CanvasRead])
async def get_canvas(
    canvas_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    canvas = await _get_user_canvas(db, canvas_id, user.id)
    return ResponseBase(data=CanvasRead.model_validate(canvas))


@router.patch("/{canvas_id}", response_model=ResponseBase[CanvasRead])
async def update_canvas(
    canvas_id: UUID,
    body: CanvasUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    canvas = await _get_user_canvas(db, canvas_id, user.id)

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return ResponseBase(data=CanvasRead.model_validate(canvas))

    for key, value in update_data.items():
        setattr(canvas, key, value)
    canvas.updated_at = func.now()

    await db.flush()
    await db.refresh(canvas)
    await db.commit()
    return ResponseBase(data=CanvasRead.model_validate(canvas))


@router.delete("/{canvas_id}", response_model=ResponseBase[None])
async def delete_canvas(
    canvas_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    canvas = await _get_user_canvas(db, canvas_id, user.id)
    canvas.status = "archived"
    canvas.updated_at = func.now()
    await db.commit()
    return ResponseBase(msg="已归档")


# ---------------------------------------------------------------------------
# CanvasNode sync
# ---------------------------------------------------------------------------

@router.get("/{canvas_id}/nodes", response_model=ResponseBase[list[CanvasNodeRead]])
async def list_canvas_nodes(
    canvas_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    await _get_user_canvas(db, canvas_id, user.id)

    result = await db.execute(
        select(CanvasNode)
        .where(CanvasNode.canvas_id == canvas_id)
        .order_by(CanvasNode.created_at)
    )
    nodes = result.scalars().all()
    return ResponseBase(data=[CanvasNodeRead.model_validate(n) for n in nodes])


@router.put("/{canvas_id}/nodes", response_model=ResponseBase[list[CanvasNodeRead]])
async def upsert_canvas_nodes(
    canvas_id: UUID,
    body: list[CanvasNodeUpsert],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Idempotent batch upsert by (canvas_id, frontend_node_id)."""
    canvas = await _get_user_canvas(db, canvas_id, user.id)

    if not body:
        return ResponseBase(data=[])

    for item in body:
        stmt = pg_insert(CanvasNode).values(
            canvas_id=canvas_id,
            frontend_node_id=item.frontend_node_id,
            node_type=item.node_type,
            source_storyboard_id=item.source_storyboard_id,
            source_asset_id=item.source_asset_id,
            config_json=item.config_json,
        ).on_conflict_do_update(
            constraint="uq_canvas_nodes_canvas_frontend_id",
            set_={
                "node_type": item.node_type,
                "source_storyboard_id": item.source_storyboard_id,
                "source_asset_id": item.source_asset_id,
                "config_json": item.config_json,
                "updated_at": func.now(),
            },
        )
        await db.execute(stmt)

    # Update canvas node_count
    count_result = await db.execute(
        select(func.count()).select_from(CanvasNode).where(CanvasNode.canvas_id == canvas_id)
    )
    canvas.node_count = count_result.scalar() or 0
    canvas.updated_at = func.now()
    await db.flush()
    await db.commit()

    # Return updated nodes
    result = await db.execute(
        select(CanvasNode)
        .where(CanvasNode.canvas_id == canvas_id)
        .order_by(CanvasNode.created_at)
    )
    nodes = result.scalars().all()
    return ResponseBase(data=[CanvasNodeRead.model_validate(n) for n in nodes])


@router.delete("/{canvas_id}/nodes/{frontend_node_id}", response_model=ResponseBase[None])
async def delete_canvas_node(
    canvas_id: UUID,
    frontend_node_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    canvas = await _get_user_canvas(db, canvas_id, user.id)

    result = await db.execute(
        select(CanvasNode).where(
            CanvasNode.canvas_id == canvas_id,
            CanvasNode.frontend_node_id == frontend_node_id,
        )
    )
    node = result.scalar_one_or_none()
    if node is None:
        raise AppError(msg="节点不存在", code=404, status_code=404)

    await db.delete(node)

    # Update canvas node_count
    count_result = await db.execute(
        select(func.count()).select_from(CanvasNode).where(CanvasNode.canvas_id == canvas_id)
    )
    canvas.node_count = count_result.scalar() or 0
    canvas.updated_at = func.now()
    await db.commit()
    return ResponseBase(msg="已删除")


# ---------------------------------------------------------------------------
# Canvas batch execution — M3.2
# ---------------------------------------------------------------------------

class BatchExecuteRequest(BaseModel):
    node_ids: list[str] = Field(default_factory=list, description="frontend_node_ids to execute; empty = all")
    trigger_type: str = Field("manual", description="manual | batch")


@router.post("/{canvas_id}/execute", response_model=ResponseBase[TaskRead])
async def batch_execute_canvas(
    canvas_id: UUID,
    body: BatchExecuteRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create a batch execution task for the canvas."""
    canvas = await _get_user_canvas(db, canvas_id, user.id)

    # Create CanvasExecution record
    execution = CanvasExecution(
        canvas_id=canvas_id,
        trigger_type=body.trigger_type,
        status="pending",
    )
    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    # Dispatch task
    task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="canvas_batch_execute",
            entity_type="canvas",
            entity_id=canvas_id,
            input_json={
                "canvas_id": str(canvas_id),
                "execution_id": str(execution.id),
                "node_ids": body.node_ids,
                "trigger_type": body.trigger_type,
            },
        ),
    )

    await db.commit()
    return ResponseBase(data=TaskRead.model_validate(task))


@router.get("/{canvas_id}/executions", response_model=ResponseBase[list[CanvasExecutionRead]])
async def list_canvas_executions(
    canvas_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    limit: int = Query(20, ge=1, le=100),
):
    """List execution history for a canvas."""
    await _get_user_canvas(db, canvas_id, user.id)

    result = await db.execute(
        select(CanvasExecution)
        .where(CanvasExecution.canvas_id == canvas_id)
        .order_by(CanvasExecution.created_at.desc())
        .limit(limit)
    )
    executions = result.scalars().all()
    return ResponseBase(data=[CanvasExecutionRead.model_validate(e) for e in executions])


# ---------------------------------------------------------------------------
# M4.2: Export node output to storyboard
# ---------------------------------------------------------------------------

class ExportToStoryboardRequest(BaseModel):
    storyboard_id: UUID = Field(..., description="Target storyboard to link output to")
    output_file_node_id: UUID | None = Field(None, description="VFS FileNode id of the generated file")


class ExportToStoryboardResponse(BaseModel):
    storyboard_id: UUID
    canvas_node_id: UUID
    linked: bool = True


@router.post(
    "/{canvas_id}/nodes/{frontend_node_id}/export-to-storyboard",
    response_model=ResponseBase[ExportToStoryboardResponse],
)
async def export_node_to_storyboard(
    canvas_id: UUID,
    frontend_node_id: str,
    body: ExportToStoryboardRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Export a canvas node's output to a storyboard row.

    Permission check: user must own the project that the storyboard belongs to.
    """
    canvas = await _get_user_canvas(db, canvas_id, user.id)

    # Verify canvas node exists
    node_result = await db.execute(
        select(CanvasNode).where(
            CanvasNode.canvas_id == canvas_id,
            CanvasNode.frontend_node_id == frontend_node_id,
        )
    )
    canvas_node = node_result.scalar_one_or_none()
    if canvas_node is None:
        raise AppError(msg="画布节点不存在", code=404, status_code=404)

    # Verify storyboard exists and check write permission
    sb = await db.get(Storyboard, body.storyboard_id)
    if sb is None:
        raise AppError(msg="故事板不存在", code=404, status_code=404)

    if sb.episode_id:
        episode = await db.get(Episode, sb.episode_id)
        if episode and episode.project_id:
            project = await db.get(Project, episode.project_id)
            if not project or project.owner_id != user.id:
                raise AppError(msg="无权限写入该故事板", code=403, status_code=403)
        elif not episode:
            raise AppError(msg="关联分集不存在", code=404, status_code=404)

    # Link: update canvas node's source_storyboard_id
    canvas_node.source_storyboard_id = body.storyboard_id
    if body.output_file_node_id:
        canvas_node.output_file_node_id = body.output_file_node_id
    await db.commit()

    return ResponseBase(
        data=ExportToStoryboardResponse(
            storyboard_id=body.storyboard_id,
            canvas_node_id=canvas_node.id,
        )
    )


# ---------------------------------------------------------------------------
# M4.2: Batch export nodes to storyboards
# ---------------------------------------------------------------------------

class BatchExportItem(BaseModel):
    frontend_node_id: str
    storyboard_id: UUID
    output_file_node_id: UUID | None = None


class BatchExportRequest(BaseModel):
    items: list[BatchExportItem] = Field(..., min_length=1)


class BatchExportResultItem(BaseModel):
    frontend_node_id: str
    storyboard_id: UUID
    success: bool
    error: str | None = None


@router.post(
    "/{canvas_id}/batch-export-to-storyboard",
    response_model=ResponseBase[list[BatchExportResultItem]],
)
async def batch_export_to_storyboard(
    canvas_id: UUID,
    body: BatchExportRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Batch export multiple nodes to their matched storyboards."""
    await _get_user_canvas(db, canvas_id, user.id)

    results: list[BatchExportResultItem] = []
    for item in body.items:
        try:
            node_result = await db.execute(
                select(CanvasNode).where(
                    CanvasNode.canvas_id == canvas_id,
                    CanvasNode.frontend_node_id == item.frontend_node_id,
                )
            )
            canvas_node = node_result.scalar_one_or_none()
            if canvas_node is None:
                results.append(BatchExportResultItem(
                    frontend_node_id=item.frontend_node_id,
                    storyboard_id=item.storyboard_id,
                    success=False,
                    error="节点不存在",
                ))
                continue

            sb = await db.get(Storyboard, item.storyboard_id)
            if sb is None:
                results.append(BatchExportResultItem(
                    frontend_node_id=item.frontend_node_id,
                    storyboard_id=item.storyboard_id,
                    success=False,
                    error="故事板不存在",
                ))
                continue

            # Permission check
            if sb.episode_id:
                episode = await db.get(Episode, sb.episode_id)
                if episode and episode.project_id:
                    project = await db.get(Project, episode.project_id)
                    if not project or project.owner_id != user.id:
                        results.append(BatchExportResultItem(
                            frontend_node_id=item.frontend_node_id,
                            storyboard_id=item.storyboard_id,
                            success=False,
                            error="无权限",
                        ))
                        continue

            canvas_node.source_storyboard_id = item.storyboard_id
            if item.output_file_node_id:
                canvas_node.output_file_node_id = item.output_file_node_id

            results.append(BatchExportResultItem(
                frontend_node_id=item.frontend_node_id,
                storyboard_id=item.storyboard_id,
                success=True,
            ))
        except Exception as e:
            results.append(BatchExportResultItem(
                frontend_node_id=item.frontend_node_id,
                storyboard_id=item.storyboard_id,
                success=False,
                error=str(e),
            ))

    await db.commit()
    return ResponseBase(data=results)


# ---------------------------------------------------------------------------
# M4.3: Save node output as project asset
# ---------------------------------------------------------------------------

class SaveAsAssetRequest(BaseModel):
    project_id: UUID = Field(..., description="Target project")
    name: str = Field(..., max_length=100, description="Asset name")
    asset_type: str = Field("scene", description="character | scene | prop | vfx")
    output_file_node_id: UUID | None = Field(None, description="VFS FileNode id of the generated file")


class SaveAsAssetResponse(BaseModel):
    asset_id: UUID
    name: str
    project_id: UUID


@router.post(
    "/{canvas_id}/nodes/{frontend_node_id}/save-as-asset",
    response_model=ResponseBase[SaveAsAssetResponse],
)
async def save_node_as_asset(
    canvas_id: UUID,
    frontend_node_id: str,
    body: SaveAsAssetRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Save a canvas node's output as a project asset.

    Permission check: user must own the target project.
    """
    await _get_user_canvas(db, canvas_id, user.id)

    # Verify canvas node exists
    node_result = await db.execute(
        select(CanvasNode).where(
            CanvasNode.canvas_id == canvas_id,
            CanvasNode.frontend_node_id == frontend_node_id,
        )
    )
    canvas_node = node_result.scalar_one_or_none()
    if canvas_node is None:
        raise AppError(msg="画布节点不存在", code=404, status_code=404)

    # Verify project and write permission
    project = await db.get(Project, body.project_id)
    if not project or project.owner_id != user.id:
        raise AppError(msg="项目不存在或无写权限", code=403, status_code=403)

    # Verify file exists if provided
    if body.output_file_node_id:
        file_node = await db.get(FileNode, body.output_file_node_id)
        if not file_node:
            raise AppError(msg="输出文件不存在", code=404, status_code=404)

    # Create Asset record
    asset = Asset(
        project_id=body.project_id,
        asset_id=f"canvas_{frontend_node_id[:12]}",
        name=body.name,
        type=body.asset_type,
        source="canvas",
    )
    db.add(asset)
    await db.flush()

    # Update canvas node with asset reference
    canvas_node.source_asset_id = asset.id
    if body.output_file_node_id:
        canvas_node.output_file_node_id = body.output_file_node_id

    await db.commit()
    await db.refresh(asset)

    return ResponseBase(
        data=SaveAsAssetResponse(
            asset_id=asset.id,
            name=asset.name,
            project_id=body.project_id,
        )
    )


# ---------------------------------------------------------------------------
# M4.4: Canvas thumbnail upload
# ---------------------------------------------------------------------------

class ThumbnailUploadRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded PNG/JPEG image data (no data: prefix)")
    content_type: str = Field("image/png", description="MIME type")


class ThumbnailUploadResponse(BaseModel):
    canvas_id: UUID
    thumbnail_node_id: UUID


@router.post("/{canvas_id}/thumbnail", response_model=ResponseBase[ThumbnailUploadResponse])
async def upload_canvas_thumbnail(
    canvas_id: UUID,
    body: ThumbnailUploadRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Upload a canvas thumbnail image and update Canvas.thumbnail_node_id."""
    from app.services.storage.vfs_service import get_or_create_canvas_output_folder, vfs_service

    canvas = await _get_user_canvas(db, canvas_id, user.id)

    # Decode base64
    try:
        image_data = base64.b64decode(body.image_base64)
    except Exception:
        raise AppError(msg="无效的 base64 图片数据", code=400, status_code=400)

    if len(image_data) > 2 * 1024 * 1024:
        raise AppError(msg="缩略图过大（最大 2MB）", code=400, status_code=400)

    # Ensure canvas output folder exists
    canvas_folder = await get_or_create_canvas_output_folder(
        db=db, user_id=user.id, canvas_id=str(canvas_id),
    )

    ext = "png" if "png" in body.content_type else "jpg"
    filename = f"thumbnail.{ext}"

    # Create or replace thumbnail file in VFS
    thumb_node = await vfs_service.create_bytes_file(
        db=db,
        user_id=user.id,
        name=filename,
        data=image_data,
        content_type=body.content_type,
        parent_id=canvas_folder.id,
    )

    # Update canvas thumbnail reference
    canvas.thumbnail_node_id = thumb_node.id
    await db.commit()

    return ResponseBase(
        data=ThumbnailUploadResponse(
            canvas_id=canvas_id,
            thumbnail_node_id=thumb_node.id,
        )
    )


# ---------------------------------------------------------------------------
# M5.1: Canvas asset-pack export
# ---------------------------------------------------------------------------

class ExportCanvasRequest(BaseModel):
    node_ids: list[str] = Field(default_factory=list, description="frontend_node_ids to export; empty = all")


@router.post("/{canvas_id}/export", response_model=ResponseBase[TaskRead])
async def export_canvas(
    canvas_id: UUID,
    body: ExportCanvasRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create an export task that packages canvas outputs into a ZIP."""
    await _get_user_canvas(db, canvas_id, user.id)

    task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="canvas_export",
            entity_type="canvas",
            entity_id=canvas_id,
            input_json={
                "canvas_id": str(canvas_id),
                "node_ids": body.node_ids,
            },
        ),
    )
    await db.commit()
    return ResponseBase(data=TaskRead.model_validate(task))


# ---------------------------------------------------------------------------
# M5.2: FCP XML export
# ---------------------------------------------------------------------------

class ExportFcpxmlRequest(BaseModel):
    node_ids: list[str] = Field(default_factory=list, description="frontend_node_ids to include; empty = all storyboard-linked")
    project_name: str = Field("", description="Timeline project name; defaults to canvas name")


@router.post("/{canvas_id}/export-fcpxml", response_model=ResponseBase[TaskRead])
async def export_fcpxml(
    canvas_id: UUID,
    body: ExportFcpxmlRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create a task that generates an FCPXML timeline from storyboard-linked nodes."""
    await _get_user_canvas(db, canvas_id, user.id)

    task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="canvas_fcpxml_export",
            entity_type="canvas",
            entity_id=canvas_id,
            input_json={
                "canvas_id": str(canvas_id),
                "node_ids": body.node_ids,
                "project_name": body.project_name,
            },
        ),
    )
    await db.commit()
    return ResponseBase(data=TaskRead.model_validate(task))
