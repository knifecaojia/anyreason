from __future__ import annotations

from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page, Params
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Asset, AssetBinding, Episode, Scene
from app.schemas import AssetBrief, EpisodeRead, SceneRead, ScriptHierarchyRead, ScriptRead
from app.schemas_response import ResponseBase
from app.services.script_service import script_service
from app.services.script_structure_service import script_structure_service
from app.storage import get_minio_client
from app.users import current_active_user


router = APIRouter()

MAX_SCRIPT_BYTES = 20 * 1024 * 1024


@router.get("", response_model=ResponseBase[Page[ScriptRead]])
async def list_scripts(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    params = Params(page=page, size=size)
    data = await script_service.list_user_scripts(db=db, user_id=user.id, params=params)
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("", response_model=ResponseBase[ScriptRead])
async def create_script(
    title: str = Form(...),
    description: str | None = Form(None),
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not file and not text:
        raise AppError(msg="必须提供 text 或 file", code=400, status_code=400)

    if file:
        file_bytes = await file.read()
        original_filename = file.filename
        content_type = file.content_type
    else:
        file_bytes = (text or "").encode("utf-8")
        original_filename = f"{title}.txt"
        content_type = "text/plain; charset=utf-8"

    if len(file_bytes) > MAX_SCRIPT_BYTES:
        raise AppError(msg="文件过大", code=413, status_code=413)

    try:
        created = await script_service.create_script(
            db=db,
            user_id=user.id,
            title=title,
            description=description,
            file_bytes=file_bytes,
            original_filename=original_filename,
            content_type=content_type,
        )
    except AppError:
        raise
    except Exception as exc:
        raise AppError(
            msg=f"对象存储写入失败（{type(exc).__name__}）",
            code=503,
            status_code=503,
        )
    return ResponseBase(code=200, msg="OK", data=ScriptRead.model_validate(created))


@router.delete("/{script_id}", response_model=ResponseBase[dict])
async def delete_script(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await script_service.soft_delete_script(db=db, user_id=user.id, script_id=script_id)
    if not deleted:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"message": "Script successfully deleted"})


@router.get("/{script_id}/download")
async def download_script(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    script = await script_service.get_user_script(db=db, user_id=user.id, script_id=script_id)
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)

    client = get_minio_client()
    try:
        obj = await run_in_threadpool(
            lambda: client.get_object(script.minio_bucket, script.minio_key)
        )
    except Exception:
        raise AppError(msg="对象存储读取失败", code=500, status_code=500)

    filename = script.original_filename or "script.txt"
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
        media_type=script.content_type or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )


async def _build_script_hierarchy(*, db: AsyncSession, script_id: UUID) -> ScriptHierarchyRead:
    ep_res = await db.execute(
        select(Episode).where(Episode.project_id == script_id).order_by(Episode.episode_number.asc())
    )
    episodes = list(ep_res.scalars().all())

    out_eps: list[EpisodeRead] = []
    for ep in episodes:
        sc_res = await db.execute(
            select(Scene).where(Scene.episode_id == ep.id).order_by(Scene.scene_number.asc())
        )
        scenes = [SceneRead.model_validate(sc) for sc in sc_res.scalars().all()]

        asset_res = await db.execute(
            select(Asset)
            .join(AssetBinding, AssetBinding.asset_entity_id == Asset.id)
            .where(AssetBinding.episode_id == ep.id)
            .order_by(Asset.asset_id.asc())
        )
        assets = [AssetBrief.model_validate(a) for a in asset_res.scalars().all()]

        out_eps.append(
            EpisodeRead(
                id=ep.id,
                episode_code=ep.episode_code,
                episode_number=ep.episode_number,
                title=ep.title,
                script_full_text=getattr(ep, "script_full_text", None),
                scenes=scenes,
                assets=assets,
            )
        )

    return ScriptHierarchyRead(script_id=script_id, episodes=out_eps)


@router.get("/{script_id}/hierarchy", response_model=ResponseBase[ScriptHierarchyRead])
async def get_script_hierarchy(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    script = await script_service.get_user_script(db=db, user_id=user.id, script_id=script_id)
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)
    data = await _build_script_hierarchy(db=db, script_id=script_id)
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/{script_id}/structure", response_model=ResponseBase[ScriptHierarchyRead])
async def structure_script(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    await script_structure_service.structure_script(db=db, user_id=user.id, script_id=script_id)
    data = await _build_script_hierarchy(db=db, script_id=script_id)
    return ResponseBase(code=200, msg="OK", data=data)
