from __future__ import annotations

import base64
import json
import logging
from typing import cast
from io import BytesIO
from datetime import datetime, timezone
from uuid import UUID

import openpyxl
from fastapi import APIRouter, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page, Params
from starlette.datastructures import Headers
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import BatchVideoJob, BatchVideoAsset, BatchVideoHistory, BatchVideoPendingImage, Task
from app.schemas import TaskCreateRequest
from app.schemas_batch_video import (
    BatchVideoJobCreate, BatchVideoJobUpdate, BatchVideoJobRead,
    BatchVideoAssetCreate, BatchVideoAssetUpdate, BatchVideoAssetRead,
    BatchVideoPendingImageCreate, BatchVideoPendingImageUpdate, BatchVideoPendingImageRead,
    BatchVideoHistoryRead, BatchVideoGenerateRequest, BatchVideoPolishRequest,
    BatchVideoExcelImportRequest,
    BatchVideoBatchPromptUpdateRequest, BatchVideoUploadAssetsRequest,
    BatchVideoPreviewTaskRead, BatchVideoPreviewSuccessRead, BatchVideoPreviewCardRead,
    BatchVideoPreviewCardsResponse, BatchVideoTaskActionRead, BatchVideoStopTaskRead,
    BatchVideoExternalCancelRead,
)
from app.schemas_response import ResponseBase
from app.services.storage.vfs_service import vfs_service
from app.services.task_service import task_service
from app.ai_gateway import ai_gateway_service
from app.schemas_media import ExternalTaskRef
from app.users import current_active_user


router = APIRouter()
logger = logging.getLogger(__name__)


def _history_status_from_task_status(task_status: str) -> str:
    mapping = {
        "queued": "pending",
        "running": "processing",
        "waiting_external": "processing",
        "succeeded": "completed",
        "failed": "failed",
        "canceled": "failed",
    }
    return mapping.get(task_status, "pending")


def _require_batch_video_model_config_id(job: BatchVideoJob) -> str:
    raw_config = cast(object, job.config)
    config = raw_config if isinstance(raw_config, dict) else {}
    model_config_id = config.get("model_config_id")
    if not model_config_id:
        raise AppError(msg="batch video job requires model_config_id before generate/retry", code=400, status_code=400)
    return str(model_config_id)


async def _cancel_external_task_if_possible(*, task: Task, user_id: UUID) -> dict:
    _ = user_id
    external_task_id = cast(str | None, task.external_task_id)
    external_provider = cast(str | None, task.external_provider)
    if not external_task_id or not external_provider:
        return {"attempted": False, "supported": False, "message": "no_external_task"}
    ref = ExternalTaskRef(
        external_task_id=external_task_id,
        provider=external_provider,
        meta=cast(dict, task.external_meta) or {},
    )
    return cast(dict, await ai_gateway_service.cancel_media_task(ref=ref))


def _build_preview_task(*, task: Task, history: BatchVideoHistory) -> BatchVideoPreviewTaskRead:
    # From task.input_json 中提取 prompt
    input_json = task.input_json or {}
    prompt = input_json.get("prompt") if isinstance(input_json, dict) else None
    
    return BatchVideoPreviewTaskRead(
        task_id=cast(UUID, task.id),
        status=cast(str, task.status),
        progress=int(cast(int | None, task.progress) or cast(int | None, history.progress) or 0),
        created_at=cast(datetime, history.created_at),
        updated_at=cast(datetime | None, task.updated_at),
        completed_at=cast(datetime | None, history.completed_at),
        result_url=cast(str | None, history.result_url),
        error_message=cast(str | None, history.error_message) or cast(str | None, task.error),
        external_task_id=cast(str | None, task.external_task_id),
        prompt=cast(str | None, prompt),
        # Queue metadata - populated for queued_for_slot tasks
        queue_position=cast(int | None, task.queue_position),
        queued_at=cast(datetime | None, task.queued_at),
    )


async def get_job_with_owner(
    db: AsyncSession, job_id: UUID, user_id: UUID
) -> BatchVideoJob:
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == job_id,
            BatchVideoJob.user_id == user_id
        )
    )
    job = result.scalars().first()
    if not job:
        raise AppError(msg="Job not found", code=404, status_code=404)
    return job


async def get_asset_with_owner(
    db: AsyncSession, asset_id: UUID, user_id: UUID
) -> BatchVideoAsset:
    result = await db.execute(
        select(BatchVideoAsset).where(
            BatchVideoAsset.id == asset_id,
            BatchVideoAsset.job_id.in_(
                select(BatchVideoJob.id).where(BatchVideoJob.user_id == user_id)
            )
        )
    )
    asset = result.scalars().first()
    if not asset:
        raise AppError(msg="Asset not found", code=404, status_code=404)
    return asset


async def get_pending_image_with_owner(
    db: AsyncSession, pending_image_id: UUID, user_id: UUID
) -> BatchVideoPendingImage:
    result = await db.execute(
        select(BatchVideoPendingImage).where(
            BatchVideoPendingImage.id == pending_image_id,
            BatchVideoPendingImage.job_id.in_(
                select(BatchVideoJob.id).where(BatchVideoJob.user_id == user_id)
            ),
        )
    )
    pending_image = result.scalars().first()
    if not pending_image:
        raise AppError(msg="Pending image not found", code=404, status_code=404)
    return pending_image


@router.post("/jobs", response_model=ResponseBase[BatchVideoJobRead])
async def create_job(
    payload: BatchVideoJobCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = BatchVideoJob(
        user_id=user.id,
        title=payload.title,
        config=payload.config.model_dump() if payload.config else {},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return ResponseBase(code=200, msg="OK", data=BatchVideoJobRead.model_validate(job))


@router.get("/jobs", response_model=ResponseBase[Page[BatchVideoJobRead]])
async def list_jobs(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
):
    params = Params(page=page, size=size)
    query = select(BatchVideoJob).where(BatchVideoJob.user_id == user.id).order_by(BatchVideoJob.created_at.desc())
    if status:
        query = query.where(BatchVideoJob.status == status)
    
    from fastapi_pagination.ext.sqlalchemy import paginate
    result = await paginate(db, query, params, transformer=lambda items: [BatchVideoJobRead.model_validate(i) for i in items])
    return ResponseBase(code=200, msg="OK", data=result)


@router.get("/jobs/{job_id}", response_model=ResponseBase[BatchVideoJobRead])
async def get_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    return ResponseBase(code=200, msg="OK", data=BatchVideoJobRead.model_validate(job))


@router.get("/jobs/{job_id}/preview-cards", response_model=ResponseBase[BatchVideoPreviewCardsResponse])
async def get_preview_cards(
    job_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    assets_result = await db.execute(
        select(BatchVideoAsset).where(BatchVideoAsset.job_id == job.id).order_by(BatchVideoAsset.index.asc())
    )
    assets = list(assets_result.scalars().all())

    cards: list[BatchVideoPreviewCardRead] = []
    for asset in assets:
        history_result = await db.execute(
            select(BatchVideoHistory)
            .where(BatchVideoHistory.asset_id == asset.id)
            .order_by(BatchVideoHistory.created_at.desc(), BatchVideoHistory.id.desc())
        )
        history_rows = list(history_result.scalars().all())
        history_items: list[BatchVideoPreviewTaskRead] = []
        latest_task: BatchVideoPreviewTaskRead | None = None
        latest_success: BatchVideoPreviewSuccessRead | None = None

        for history in history_rows:
            task = await db.get(Task, history.task_id) if history.task_id else None
            if task is None:
                continue
            preview_task = _build_preview_task(task=task, history=history)
            history_items.append(preview_task)
            if latest_task is None:
                latest_task = preview_task
            history_result_url = cast(str | None, history.result_url)
            if latest_success is None and history_result_url:
                latest_success = BatchVideoPreviewSuccessRead(
                    result_url=history_result_url,
                    completed_at=cast(datetime | None, history.completed_at),
                )

        cards.append(
            BatchVideoPreviewCardRead(
                asset_id=cast(UUID, asset.id),
                index=cast(int, asset.index),
                card_thumbnail_url=cast(str | None, asset.thumbnail_url) or cast(str, asset.source_url),
                card_source_url=cast(str, asset.source_url),
                prompt=cast(str | None, asset.prompt),
                latest_task=latest_task,
                latest_success=latest_success,
                history=history_items,
            )
        )

    return ResponseBase(
        code=200,
        msg="OK",
        data=BatchVideoPreviewCardsResponse(job=BatchVideoJobRead.model_validate(job), cards=cards),
    )


@router.patch("/jobs/{job_id}", response_model=ResponseBase[BatchVideoJobRead])
async def update_job(
    job_id: UUID,
    payload: BatchVideoJobUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    if payload.title is not None:
        job.title = payload.title
    if payload.config is not None:
        job.config = payload.config.model_dump()
    if payload.status is not None:
        job.status = payload.status
    await db.commit()
    await db.refresh(job)
    return ResponseBase(code=200, msg="OK", data=BatchVideoJobRead.model_validate(job))


@router.delete("/jobs/{job_id}", response_model=ResponseBase[dict])
async def delete_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    await db.delete(job)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.post("/jobs/{job_id}/assets", response_model=ResponseBase[list[BatchVideoAssetRead]])
async def add_assets(
    job_id: UUID,
    payloads: list[BatchVideoAssetCreate],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    assets = []
    for i, p in enumerate(payloads):
        asset = BatchVideoAsset(
            job_id=job.id,
            source_url=p.source_url,
            thumbnail_url=p.thumbnail_url,
            prompt=p.prompt,
            index=p.index or i,
            source_image_id=p.source_image_id,
            slice_index=p.slice_index,
        )
        db.add(asset)
        assets.append(asset)
    
    job.total_assets = len(assets)
    await db.commit()
    for asset in assets:
        await db.refresh(asset)
    return ResponseBase(code=200, msg="OK", data=[BatchVideoAssetRead.model_validate(a) for a in assets])


@router.get("/jobs/{job_id}/assets", response_model=ResponseBase[list[BatchVideoAssetRead]])
async def list_assets(
    job_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    result = await db.execute(
        select(BatchVideoAsset).where(BatchVideoAsset.job_id == job.id).order_by(BatchVideoAsset.index)
    )
    assets = result.scalars().all()
    return ResponseBase(code=200, msg="OK", data=[BatchVideoAssetRead.model_validate(a) for a in assets])


@router.post("/jobs/{job_id}/assets/upload", response_model=ResponseBase[list[BatchVideoAssetRead]])
async def upload_assets(
    job_id: UUID,
    payload: BatchVideoUploadAssetsRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    existing_result = await db.execute(
        select(BatchVideoAsset).where(BatchVideoAsset.job_id == job.id).order_by(BatchVideoAsset.index.desc())
    )
    existing_assets = existing_result.scalars().all()
    next_index = (existing_assets[0].index + 1) if existing_assets else 0

    created_assets = []
    for offset, image in enumerate(payload.images):
        if "," not in image.dataUrl:
            raise AppError(msg="Invalid image payload", code=400, status_code=400)

        header, encoded = image.dataUrl.split(",", 1)
        content_type = "image/jpeg"
        if header.startswith("data:") and ";base64" in header:
            content_type = header[5:].split(";", 1)[0] or content_type
        raw_bytes = base64.b64decode(encoded)

        node = await vfs_service.upload_file(
            db=db,
            user_id=user.id,
            file=UploadFile(
                filename=f"batch-video-{job.id}-{next_index + offset}.jpg",
                file=BytesIO(raw_bytes),
                headers=Headers(raw=[(b"content-type", content_type.encode())])
            )
        )
        asset = BatchVideoAsset(
            job_id=job.id,
            source_url=f"/api/v1/vfs/nodes/{node.id}/download",
            thumbnail_url=f"/api/v1/vfs/nodes/{node.id}/thumbnail",
            index=next_index + offset,
            source_image_id=image.source_image_id,
            slice_index=image.slice_index,
        )
        db.add(asset)
        created_assets.append(asset)

    job.total_assets = len(existing_assets) + len(created_assets)
    await db.commit()
    for asset in created_assets:
        await db.refresh(asset)
    return ResponseBase(code=200, msg="OK", data=[BatchVideoAssetRead.model_validate(a) for a in created_assets])


@router.get("/assets/{asset_id}", response_model=ResponseBase[BatchVideoAssetRead])
async def get_asset(
    asset_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    asset = await get_asset_with_owner(db, asset_id, user.id)
    return ResponseBase(code=200, msg="OK", data=BatchVideoAssetRead.model_validate(asset))


@router.patch("/assets/{asset_id}", response_model=ResponseBase[BatchVideoAssetRead])
async def update_asset(
    asset_id: UUID,
    payload: BatchVideoAssetUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    asset = await get_asset_with_owner(db, asset_id, user.id)
    if payload.prompt is not None:
        asset.prompt = payload.prompt
    if payload.index is not None:
        asset.index = payload.index
    if payload.status is not None:
        asset.status = payload.status
    if payload.result_url is not None:
        asset.result_url = payload.result_url
    if payload.error_message is not None:
        asset.error_message = payload.error_message
    if payload.source_image_id is not None:
        asset.source_image_id = payload.source_image_id
    if payload.slice_index is not None:
        asset.slice_index = payload.slice_index
    await db.commit()
    await db.refresh(asset)
    return ResponseBase(code=200, msg="OK", data=BatchVideoAssetRead.model_validate(asset))


@router.post("/jobs/{job_id}/pending-images", response_model=ResponseBase[list[BatchVideoPendingImageRead]])
async def add_pending_images(
    job_id: UUID,
    payloads: list[BatchVideoPendingImageCreate],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    items = []
    for payload in payloads:
        item = BatchVideoPendingImage(
            job_id=job.id,
            source_url=payload.source_url,
            thumbnail_url=payload.thumbnail_url,
            original_filename=payload.original_filename,
            content_type=payload.content_type,
            mode=payload.mode,
            linked_cell_key=payload.linked_cell_key,
            linked_cell_label=payload.linked_cell_label,
            processed=payload.processed,
        )
        db.add(item)
        items.append(item)

    await db.commit()
    for item in items:
        await db.refresh(item)
    return ResponseBase(code=200, msg="OK", data=[BatchVideoPendingImageRead.model_validate(item) for item in items])


@router.get("/jobs/{job_id}/pending-images", response_model=ResponseBase[list[BatchVideoPendingImageRead]])
async def list_pending_images(
    job_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    result = await db.execute(
        select(BatchVideoPendingImage)
        .where(BatchVideoPendingImage.job_id == job.id)
        .order_by(BatchVideoPendingImage.created_at.asc())
    )
    items = result.scalars().all()
    return ResponseBase(code=200, msg="OK", data=[BatchVideoPendingImageRead.model_validate(item) for item in items])


@router.patch("/pending-images/{pending_image_id}", response_model=ResponseBase[BatchVideoPendingImageRead])
async def update_pending_image(
    pending_image_id: UUID,
    payload: BatchVideoPendingImageUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    item = await get_pending_image_with_owner(db, pending_image_id, user.id)
    if payload.mode is not None:
        item.mode = payload.mode
    if payload.linked_cell_key is not None:
        item.linked_cell_key = payload.linked_cell_key
    if payload.linked_cell_label is not None:
        item.linked_cell_label = payload.linked_cell_label
    if payload.processed is not None:
        item.processed = payload.processed
    await db.commit()
    await db.refresh(item)
    return ResponseBase(code=200, msg="OK", data=BatchVideoPendingImageRead.model_validate(item))


@router.delete("/pending-images/{pending_image_id}", response_model=ResponseBase[dict])
async def delete_pending_image(
    pending_image_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    item = await get_pending_image_with_owner(db, pending_image_id, user.id)
    await db.delete(item)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.delete("/assets/{asset_id}", response_model=ResponseBase[dict])
async def delete_asset(
    asset_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    asset = await get_asset_with_owner(db, asset_id, user.id)
    await db.delete(asset)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.post("/assets/batch-update-prompts", response_model=ResponseBase[list[BatchVideoAssetRead]])
async def batch_update_asset_prompts(
    payload: BatchVideoBatchPromptUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    updated_assets = []
    for item in payload.updates:
        asset = await get_asset_with_owner(db, item.asset_id, user.id)
        asset.prompt = item.prompt
        updated_assets.append(asset)

    await db.commit()
    for asset in updated_assets:
        await db.refresh(asset)
    return ResponseBase(code=200, msg="OK", data=[BatchVideoAssetRead.model_validate(a) for a in updated_assets])


@router.post("/assets/generate", response_model=ResponseBase[list[dict]])
async def generate_videos(
    payload: BatchVideoGenerateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created_tasks = []
    for asset_id in payload.asset_ids:
        asset = await get_asset_with_owner(db, asset_id, user.id)
        
        job = await get_job_with_owner(db, asset.job_id, user.id)
        model_config_id = _require_batch_video_model_config_id(job)
        logger.info(
            "[batch-video] generate request job=%s asset=%s resolved_model_config_id=%s job_config=%s",
            job.id,
            asset.id,
            model_config_id,
            job.config,
        )
        
        task = await task_service.create_task(
            db=db,
            user_id=user.id,
            payload=TaskCreateRequest(
                type="batch_video_asset_generate",
                entity_type="batch_video_asset",
                entity_id=asset.id,
                input_json={
                    "job_id": str(job.id),
                    "asset_id": str(asset.id),
                    "source_url": asset.source_url,
                    "prompt": asset.prompt or "",
                    "config": job.config,
                },
            ),
        )
        logger.info(
            "[batch-video] created task task=%s type=%s asset=%s job=%s input_config=%s",
            task.id,
            task.type,
            asset.id,
            job.id,
            (task.input_json or {}).get("config") if isinstance(task.input_json, dict) else None,
        )
        
        history = BatchVideoHistory(
            asset_id=asset.id,
            task_id=task.id,
            status="pending",
        )
        db.add(history)
        
        # Note: asset.status is NOT set to "generating" here.
        # Asset status is independent of tasks - one asset can have multiple generation tasks.
        created_tasks.append({"asset_id": str(asset.id), "task_id": str(task.id)})
    
    await db.commit()
    
    job.status = "processing"
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data=created_tasks)


@router.get("/history", response_model=ResponseBase[list[BatchVideoHistoryRead]])
async def list_history(
    asset_id: UUID | None = Query(None),
    task_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(BatchVideoHistory).order_by(BatchVideoHistory.created_at.desc())
    
    if asset_id:
        asset = await get_asset_with_owner(db, asset_id, user.id)
        query = query.where(BatchVideoHistory.asset_id == asset_id)
    elif task_id:
        result = await db.execute(
            select(BatchVideoHistory).where(BatchVideoHistory.task_id == task_id)
        )
        history = result.scalars().first()
        if history:
            await get_asset_with_owner(db, history.asset_id, user.id)
        query = query.where(BatchVideoHistory.task_id == task_id)
    else:
        raise AppError(msg="asset_id or task_id is required", code=400, status_code=400)
    
    result = await db.execute(query.limit(100))
    history_records = result.scalars().all()
    return ResponseBase(code=200, msg="OK", data=[BatchVideoHistoryRead.model_validate(h) for h in history_records])


@router.post("/tasks/{task_id}/retry", response_model=ResponseBase[BatchVideoTaskActionRead])
async def retry_batch_video_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.get_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    if str(task.type or "") != "batch_video_asset_generate":
        raise AppError(msg="Task type not supported", code=400, status_code=400)
    asset_id = cast(UUID | None, task.entity_id)
    if asset_id is None:
        raise AppError(msg="Task asset not found", code=400, status_code=400)

    asset = await get_asset_with_owner(db, asset_id, user.id)
    job = await get_job_with_owner(db, asset.job_id, user.id)
    model_config_id = _require_batch_video_model_config_id(job)
    logger.info(
        "[batch-video] retry request prior_task=%s job=%s asset=%s resolved_model_config_id=%s job_config=%s",
        task.id,
        job.id,
        asset.id,
        model_config_id,
        job.config,
    )

    new_task = await task_service.create_task(
        db=db,
        user_id=user.id,
        payload=TaskCreateRequest(
            type="batch_video_asset_generate",
            entity_type="batch_video_asset",
            entity_id=asset.id,
            input_json={
                "job_id": str(job.id),
                "asset_id": str(asset.id),
                "source_url": asset.source_url,
                "prompt": asset.prompt or "",
                "config": job.config,
                "retry_from_task_id": str(task.id),
            },
        ),
    )
    logger.info(
        "[batch-video] created retry task task=%s prior_task=%s asset=%s job=%s input_config=%s",
        new_task.id,
        task.id,
        asset.id,
        job.id,
        (new_task.input_json or {}).get("config") if isinstance(new_task.input_json, dict) else None,
    )
    history = BatchVideoHistory(asset_id=asset.id, task_id=new_task.id, status="pending", progress=0)
    db.add(history)
    await db.commit()

    return ResponseBase(
        code=200,
        msg="OK",
        data=BatchVideoTaskActionRead(task_id=cast(UUID, new_task.id), asset_id=cast(UUID, asset.id), status="pending"),
    )


@router.post("/tasks/{task_id}/stop", response_model=ResponseBase[BatchVideoStopTaskRead])
async def stop_batch_video_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    task = await task_service.cancel_task(db=db, user_id=user.id, task_id=task_id)
    if task is None:
        raise AppError(msg="Task not found", code=404, status_code=404)
    if str(task.type or "") != "batch_video_asset_generate":
        raise AppError(msg="Task type not supported", code=400, status_code=400)
    asset_id = cast(UUID | None, task.entity_id)
    if asset_id is None:
        raise AppError(msg="Task asset not found", code=400, status_code=400)

    external_cancel_result = await _cancel_external_task_if_possible(task=task, user_id=user.id)

    history_result = await db.execute(
        select(BatchVideoHistory).where(BatchVideoHistory.task_id == task.id).limit(1)
    )
    history = history_result.scalars().first()
    if history:
        history.status = _history_status_from_task_status(task.status)
        history.progress = int(task.progress or history.progress or 0)
        history.error_message = history.error_message or "已停止"
        history.completed_at = history.completed_at or datetime.now(timezone.utc)
        await db.commit()

    return ResponseBase(
        code=200,
        msg="OK",
        data=BatchVideoStopTaskRead(
            task_id=task.id,
            asset_id=asset_id,
            status=cast(str, task.status),
            external_cancel=BatchVideoExternalCancelRead(**external_cancel_result),
        ),
    )


@router.post("/jobs/{job_id}/import-excel", response_model=ResponseBase[dict])
async def import_excel(
    job_id: UUID,
    file: UploadFile = File(...),
    payload: BatchVideoExcelImportRequest = Depends(),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    job = await get_job_with_owner(db, job_id, user.id)
    
    content = await file.read()
    workbook = openpyxl.load_workbook(BytesIO(content))
    sheet = workbook.active
    
    index_col_idx = None
    prompt_col_idx = None
    headers = []
    for col_idx, cell in enumerate(sheet[1], start=1):
        headers.append(cell.value)
        if cell.value == payload.index_column:
            index_col_idx = col_idx
        if cell.value == payload.prompt_column:
            prompt_col_idx = col_idx
    
    if not index_col_idx or not prompt_col_idx:
        raise AppError(msg="Excel 文件中未找到对应的列", code=400, status_code=400)
    
    result = await db.execute(
        select(BatchVideoAsset).where(BatchVideoAsset.job_id == job.id).order_by(BatchVideoAsset.index)
    )
    assets = {a.index: a for a in result.scalars().all()}
    
    imported_count = 0
    for row in sheet.iter_rows(min_row=2, values_only=True):
        idx = row[index_col_idx - 1]
        prompt = row[prompt_col_idx - 1]
        
        if idx is not None and idx in assets:
            assets[idx].prompt = prompt
            imported_count += 1
    
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data={"imported": imported_count})


@router.post("/assets/polish", response_model=ResponseBase[list[BatchVideoAssetRead]])
async def polish_prompts(
    payload: BatchVideoPolishRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    polished_assets = []
    for asset_id in payload.asset_ids:
        asset = await get_asset_with_owner(db, asset_id, user.id)
        if asset.prompt:
            asset.prompt = f"{payload.instruction}\n\n原始提示词：{asset.prompt}"
        polished_assets.append(asset)
    
    await db.commit()
    for asset in polished_assets:
        await db.refresh(asset)
    
    return ResponseBase(code=200, msg="OK", data=[BatchVideoAssetRead.model_validate(a) for a in polished_assets])
