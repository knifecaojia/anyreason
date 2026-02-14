from __future__ import annotations

from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page, Params
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Asset, AssetBinding, Episode, FileNode, Storyboard
from app.schemas import AssetBrief, EpisodeRead, StoryboardRead, ScriptHierarchyRead, ScriptRead, ScriptStatsRead
from app.schemas_response import ResponseBase
from app.services.script_parse_service import script_parse_service
from app.services.script_service import script_service
from app.services.script_structure_service import script_structure_service
from app.storage import get_minio_client
from app.users import current_active_user


router = APIRouter()

MAX_SCRIPT_BYTES = 20 * 1024 * 1024
ASPECT_RATIO_CHOICES = {"16:9", "9:16", "4:3", "3:4", "1:1", "21:9"}


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
    aspect_ratio: str | None = Form(None),
    animation_style: str | None = Form(None),
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    panorama_image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not file and not text:
        raise AppError(msg="必须提供 text 或 file", code=400, status_code=400)

    ratio = (aspect_ratio or "").strip() or None
    if ratio is not None and ratio not in ASPECT_RATIO_CHOICES:
        raise AppError(msg="画面比例不合法", code=400, status_code=400)

    style = (animation_style or "").strip() or None
    if style is not None and len(style) > 64:
        raise AppError(msg="动画风格过长", code=400, status_code=400)

    if file:
        file_bytes = await file.read()
        original_filename = file.filename
        content_type = file.content_type
        ext = script_parse_service.get_ext(original_filename)
        if ext not in script_parse_service.ALLOWED_SCRIPT_EXTS:
            raise AppError(msg="仅支持上传 txt / md / doc / docx 文件", code=400, status_code=400)
        if len(file_bytes) > MAX_SCRIPT_BYTES:
            raise AppError(msg="文件过大", code=413, status_code=413)
        parsed_text = script_parse_service.parse_script_file(filename=original_filename, file_bytes=file_bytes)
        file_bytes = parsed_text.encode("utf-8")
        if ext == ".md":
            content_type = "text/markdown; charset=utf-8"
        else:
            content_type = "text/plain; charset=utf-8"
        original_filename = f"{title}.md" if ext == ".md" else f"{title}.txt"
    else:
        parsed_text = (text or "")
        file_bytes = parsed_text.encode("utf-8")
        original_filename = f"{title}.txt"
        content_type = "text/plain; charset=utf-8"

    if len(file_bytes) > MAX_SCRIPT_BYTES:
        raise AppError(msg="文件过大", code=413, status_code=413)

    panorama_file_bytes: bytes | None = None
    panorama_original_filename: str | None = None
    panorama_content_type: str | None = None
    if panorama_image:
        panorama_file_bytes = await panorama_image.read()
        panorama_original_filename = panorama_image.filename
        panorama_content_type = panorama_image.content_type
        if len(panorama_file_bytes) > MAX_SCRIPT_BYTES:
            raise AppError(msg="参考图过大", code=413, status_code=413)

    try:
        created = await script_service.create_script(
            db=db,
            user_id=user.id,
            title=title,
            description=description,
            aspect_ratio=ratio,
            animation_style=style,
            file_bytes=file_bytes,
            original_filename=original_filename,
            content_type=content_type,
            panorama_file_bytes=panorama_file_bytes,
            panorama_original_filename=panorama_original_filename,
            panorama_content_type=panorama_content_type,
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


@router.get("/{script_id}/panorama")
async def get_script_panorama(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    script = await script_service.get_user_script(db=db, user_id=user.id, script_id=script_id)
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)
    if not getattr(script, "panorama_minio_bucket", None) or not getattr(script, "panorama_minio_key", None):
        raise AppError(msg="Panorama not found", code=404, status_code=404)

    client = get_minio_client()
    try:
        obj = await run_in_threadpool(
            lambda: client.get_object(script.panorama_minio_bucket, script.panorama_minio_key)
        )
    except Exception:
        raise AppError(msg="对象存储读取失败", code=500, status_code=500)

    filename = script.panorama_original_filename or "panorama.png"
    disposition = f"inline; filename*=UTF-8''{quote(filename)}"

    def iterator():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        iterator(),
        media_type=script.panorama_content_type or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )


@router.get("/{script_id}/panorama/thumbnail")
async def get_script_panorama_thumbnail(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    script = await script_service.get_user_script(db=db, user_id=user.id, script_id=script_id)
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)
    if not getattr(script, "panorama_thumb_minio_bucket", None) or not getattr(script, "panorama_thumb_minio_key", None):
        raise AppError(msg="Panorama thumbnail not found", code=404, status_code=404)

    client = get_minio_client()
    try:
        obj = await run_in_threadpool(
            lambda: client.get_object(script.panorama_thumb_minio_bucket, script.panorama_thumb_minio_key)
        )
    except Exception:
        raise AppError(msg="对象存储读取失败", code=500, status_code=500)

    filename = (script.panorama_original_filename or "panorama").rsplit(".", 1)[0] + "_thumb"
    disposition = f"inline; filename*=UTF-8''{quote(filename)}"

    def iterator():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        iterator(),
        media_type=getattr(script, "panorama_thumb_content_type", None) or "image/jpeg",
        headers={"Content-Disposition": disposition},
    )


async def _build_script_hierarchy(*, db: AsyncSession, script_id: UUID) -> ScriptHierarchyRead:
    ep_res = await db.execute(
        select(Episode).where(Episode.project_id == script_id).order_by(Episode.episode_number.asc())
    )
    episodes = list(ep_res.scalars().all())

    out_eps: list[EpisodeRead] = []
    for ep in episodes:
        sb_res = await db.execute(
            select(Storyboard)
            .where(Storyboard.episode_id == ep.id)
            .order_by(Storyboard.scene_number.asc(), Storyboard.shot_number.asc())
        )
        storyboards = [StoryboardRead.model_validate(sb) for sb in sb_res.scalars().all()]

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
                storyboard_root_node_id=getattr(ep, "storyboard_root_node_id", None),
                asset_root_node_id=getattr(ep, "asset_root_node_id", None),
                storyboards=storyboards,
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


@router.get("/{script_id}/stats", response_model=ResponseBase[ScriptStatsRead])
async def get_script_stats(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    script = await script_service.get_user_script(db=db, user_id=user.id, script_id=script_id)
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)

    ep_ids_subq = select(Episode.id).where(Episode.project_id == script_id).subquery()

    episodes_count = int(
        (
            await db.execute(
                select(func.count()).select_from(Episode).where(Episode.project_id == script_id)
            )
        ).scalar_one()
        or 0
    )

    word_count = 0
    ep_text_rows = (
        await db.execute(
            select(Episode.script_full_text).where(Episode.project_id == script_id)
        )
    ).all()
    for (txt,) in ep_text_rows:
        if not txt:
            continue
        word_count += len("".join(str(txt).split()))

    asset_counts_rows = (
        await db.execute(
            select(Asset.type, func.count(func.distinct(Asset.id)))
            .select_from(Asset)
            .join(AssetBinding, AssetBinding.asset_entity_id == Asset.id)
            .where(AssetBinding.episode_id.in_(select(ep_ids_subq.c.id)))
            .group_by(Asset.type)
        )
    ).all()
    asset_counts = {str(t): int(c or 0) for (t, c) in asset_counts_rows}
    scene_count = asset_counts.get("scene", 0)
    character_count = asset_counts.get("character", 0)
    prop_count = asset_counts.get("prop", 0)
    vfx_count = asset_counts.get("vfx", 0)

    if scene_count == 0:
        scene_count = int(
            (
                await db.execute(
                    select(func.count(func.distinct(func.concat(Storyboard.episode_id, "-", Storyboard.scene_number))))
                    .where(Storyboard.episode_id.in_(select(ep_ids_subq.c.id)))
                    .where(Storyboard.scene_number.is_not(None))
                )
            ).scalar_one()
            or 0
        )

    image_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(FileNode)
                .where(FileNode.project_id == script_id)
                .where(FileNode.is_folder.is_(False))
                .where(FileNode.content_type.ilike("image/%"))
            )
        ).scalar_one()
        or 0
    )
    video_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(FileNode)
                .where(FileNode.project_id == script_id)
                .where(FileNode.is_folder.is_(False))
                .where(FileNode.content_type.ilike("video/%"))
            )
        ).scalar_one()
        or 0
    )

    if int(getattr(script, "panorama_size_bytes", 0) or 0) > 0:
        image_count += 1

    return ResponseBase(
        code=200,
        msg="OK",
        data=ScriptStatsRead(
            script_id=script_id,
            word_count=word_count,
            episodes_count=episodes_count,
            scene_count=scene_count,
            character_count=character_count,
            prop_count=prop_count,
            vfx_count=vfx_count,
            image_count=image_count,
            video_count=video_count,
        ),
    )


@router.post("/{script_id}/structure", response_model=ResponseBase[ScriptHierarchyRead])
async def structure_script(
    script_id: UUID,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not force:
        episodes_count = int(
            (
                await db.execute(
                    select(func.count()).select_from(Episode).where(Episode.project_id == script_id)
                )
            ).scalar_one()
            or 0
        )
        if episodes_count > 0:
            data = await _build_script_hierarchy(db=db, script_id=script_id)
            return ResponseBase(code=200, msg="OK", data=data)

    await script_structure_service.structure_script(db=db, user_id=user.id, script_id=script_id)
    data = await _build_script_hierarchy(db=db, script_id=script_id)
    return ResponseBase(code=200, msg="OK", data=data)
