from __future__ import annotations

import re
from uuid import UUID, uuid4

from fastapi_pagination import Params
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models import Project, Script
from app.repositories import script_repository
from app.storage import get_storage_provider
from app.storage.image_thumbs import generate_thumbnail, should_generate_thumbnail


def _safe_filename(value: str) -> str:
    name = (value or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"\s+", "_", name)
    return name or "script.txt"


def _slug(value: str) -> str:
    v = (value or "").strip()
    v = re.sub(r"\s+", "_", v)
    v = re.sub(r"[^\w\u4e00-\u9fff\-_.]+", "", v)
    v = v.strip("._-")
    return v or "script"


async def _ensure_bucket(bucket: str) -> None:
    provider = get_storage_provider()
    await run_in_threadpool(provider.ensure_bucket, bucket)


async def _put_object(*, bucket: str, key: str, data: bytes, content_type: str | None) -> None:
    provider = get_storage_provider()
    await run_in_threadpool(provider.put_bytes, bucket, key, data, content_type)


async def _remove_object(*, bucket: str, key: str) -> None:
    provider = get_storage_provider()
    await run_in_threadpool(provider.delete_object, bucket, key)


class ScriptService:
    async def list_user_scripts(self, *, db: AsyncSession, user_id: UUID, params: Params):
        return await script_repository.list_user_scripts(db=db, user_id=user_id, params=params)

    async def create_script(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        title: str,
        description: str | None,
        aspect_ratio: str | None = None,
        animation_style: str | None = None,
        file_bytes: bytes,
        original_filename: str | None,
        content_type: str | None,
        panorama_file_bytes: bytes | None = None,
        panorama_original_filename: str | None = None,
        panorama_content_type: str | None = None,
    ) -> Script:
        bucket = settings.MINIO_BUCKET_SCRIPTS
        await _ensure_bucket(bucket)

        script_id = uuid4()
        filename = _safe_filename(original_filename or f"{_slug(title)}.txt")
        key = f"scripts/{user_id}/{script_id}/{filename}"

        panorama_key: str | None = None
        panorama_filename: str | None = None
        panorama_thumb_key: str | None = None
        panorama_thumb_filename: str | None = None
        panorama_thumb_content_type: str | None = None
        panorama_thumb_size_bytes = 0

        await _put_object(bucket=bucket, key=key, data=file_bytes, content_type=content_type)
        if panorama_file_bytes:
            panorama_filename = _safe_filename(panorama_original_filename or "panorama.png")
            panorama_key = f"scripts/{user_id}/{script_id}/panorama/{panorama_filename}"
            await _put_object(bucket=bucket, key=panorama_key, data=panorama_file_bytes, content_type=panorama_content_type)
            if should_generate_thumbnail(content_type=panorama_content_type, filename=panorama_filename):
                try:
                    thumb = generate_thumbnail(panorama_file_bytes, max_size=512)
                    ext = ".jpg" if thumb.content_type == "image/jpeg" else ".png"
                    panorama_thumb_filename = f"thumbnail{ext}"
                    panorama_thumb_key = f"scripts/{user_id}/{script_id}/panorama/thumb/{panorama_thumb_filename}"
                    panorama_thumb_content_type = thumb.content_type
                    panorama_thumb_size_bytes = thumb.size_bytes
                    await _put_object(bucket=bucket, key=panorama_thumb_key, data=thumb.data, content_type=thumb.content_type)
                except Exception:
                    panorama_thumb_key = None
                    panorama_thumb_filename = None
                    panorama_thumb_content_type = None
                    panorama_thumb_size_bytes = 0
        script = Script(
            id=script_id,
            owner_id=user_id,
            project_id=script_id,  # Project shares the same ID with Script
            title=title,
            description=description,
            aspect_ratio=aspect_ratio,
            animation_style=animation_style,
            minio_bucket=bucket,
            minio_key=key,
            original_filename=filename,
            content_type=content_type,
            size_bytes=len(file_bytes),
            panorama_minio_bucket=bucket if panorama_key else None,
            panorama_minio_key=panorama_key,
            panorama_original_filename=panorama_filename,
            panorama_content_type=panorama_content_type if panorama_key else None,
            panorama_size_bytes=len(panorama_file_bytes or b""),
            panorama_thumb_minio_bucket=bucket if panorama_thumb_key else None,
            panorama_thumb_minio_key=panorama_thumb_key,
            panorama_thumb_content_type=panorama_thumb_content_type if panorama_thumb_key else None,
            panorama_thumb_size_bytes=panorama_thumb_size_bytes,
        )
        
        project = Project(
            id=script_id,
            owner_id=user_id,
            name=title,
        )

        try:
            db.add(project)
            return await script_repository.create_script(db=db, script=script)
        except Exception:
            await _remove_object(bucket=bucket, key=key)
            if panorama_key:
                await _remove_object(bucket=bucket, key=panorama_key)
            if panorama_thumb_key:
                await _remove_object(bucket=bucket, key=panorama_thumb_key)
            raise

    async def get_user_script(self, *, db: AsyncSession, user_id: UUID, script_id: UUID) -> Script | None:
        return await script_repository.get_user_script(db=db, user_id=user_id, script_id=script_id)

    async def soft_delete_script(self, *, db: AsyncSession, user_id: UUID, script_id: UUID) -> bool:
        return await script_repository.soft_delete_script(db=db, user_id=user_id, script_id=script_id)


script_service = ScriptService()
