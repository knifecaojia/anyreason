from __future__ import annotations

import io
import re
from uuid import UUID, uuid4

from fastapi_pagination import Params
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models import Script
from app.repositories import script_repository
from app.storage import get_minio_client


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
    client = get_minio_client()

    def _op():
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)

    await run_in_threadpool(_op)


async def _put_object(*, bucket: str, key: str, data: bytes, content_type: str | None) -> None:
    client = get_minio_client()

    def _op():
        client.put_object(
            bucket_name=bucket,
            object_name=key,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type or "application/octet-stream",
        )

    await run_in_threadpool(_op)


async def _remove_object(*, bucket: str, key: str) -> None:
    client = get_minio_client()

    def _op():
        client.remove_object(bucket_name=bucket, object_name=key)

    await run_in_threadpool(_op)


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
        file_bytes: bytes,
        original_filename: str | None,
        content_type: str | None,
    ) -> Script:
        bucket = settings.MINIO_BUCKET_SCRIPTS
        await _ensure_bucket(bucket)

        script_id = uuid4()
        filename = _safe_filename(original_filename or f"{_slug(title)}.txt")
        key = f"scripts/{user_id}/{script_id}/{filename}"

        await _put_object(bucket=bucket, key=key, data=file_bytes, content_type=content_type)
        script = Script(
            id=script_id,
            owner_id=user_id,
            title=title,
            description=description,
            minio_bucket=bucket,
            minio_key=key,
            original_filename=filename,
            content_type=content_type,
            size_bytes=len(file_bytes),
        )

        try:
            return await script_repository.create_script(db=db, script=script)
        except Exception:
            await _remove_object(bucket=bucket, key=key)
            raise

    async def get_user_script(self, *, db: AsyncSession, user_id: UUID, script_id: UUID) -> Script | None:
        return await script_repository.get_user_script(db=db, user_id=user_id, script_id=script_id)

    async def soft_delete_script(self, *, db: AsyncSession, user_id: UUID, script_id: UUID) -> bool:
        return await script_repository.soft_delete_script(db=db, user_id=user_id, script_id=script_id)


script_service = ScriptService()
