from __future__ import annotations

import io
import mimetypes
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.models import FileNode
from app.config import settings
from app.storage.minio_client import get_minio_client
from app.storage.image_thumbs import generate_thumbnail, should_generate_thumbnail


async def _ensure_bucket(bucket: str) -> None:
    client = get_minio_client()

    def _op():
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)

    await run_in_threadpool(_op)


async def _put_object(*, bucket: str, key: str, data: bytes, content_type: str) -> None:
    client = get_minio_client()

    def _op():
        client.put_object(
            bucket_name=bucket,
            object_name=key,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    await run_in_threadpool(_op)


async def _remove_object(*, bucket: str, key: str) -> None:
    client = get_minio_client()

    def _op():
        client.remove_object(bucket_name=bucket, object_name=key)

    await run_in_threadpool(_op)


class VFSService:
    async def list_nodes(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        parent_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> list[FileNode]:
        query = select(FileNode).where(FileNode.parent_id == parent_id)

        if workspace_id:
            query = query.where(FileNode.workspace_id == workspace_id)
        elif project_id:
            query = query.where(FileNode.project_id == project_id)
        else:
            # Global or root level query logic here
            pass

        result = await db.execute(query)
        return list(result.scalars().all())

    async def create_folder(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        parent_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> FileNode:
        folder = FileNode(
            id=uuid4(),
            name=name,
            is_folder=True,
            parent_id=parent_id,
            workspace_id=workspace_id,
            project_id=project_id,
            created_by=user_id,
        )
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        return folder

    async def upload_file(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        file: UploadFile,
        parent_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> FileNode:
        file_id = uuid4()
        bucket_name = settings.MINIO_BUCKET_VFS
        await _ensure_bucket(bucket_name)
        object_key = f"vfs/{workspace_id or 'global'}/{project_id or 'shared'}/{file_id}/{file.filename}"

        data = await file.read()
        content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
        await _put_object(
            bucket=bucket_name,
            key=object_key,
            data=data,
            content_type=content_type,
        )

        thumb_bucket: str | None = None
        thumb_key: str | None = None
        thumb_content_type: str | None = None
        thumb_size_bytes = 0
        if should_generate_thumbnail(content_type=content_type, filename=file.filename):
            try:
                thumb = generate_thumbnail(data, max_size=512)
                ext = ".jpg" if thumb.content_type == "image/jpeg" else ".png"
                thumb_bucket = bucket_name
                thumb_key = f"vfs/{workspace_id or 'global'}/{project_id or 'shared'}/{file_id}/thumb/thumbnail{ext}"
                thumb_content_type = thumb.content_type
                thumb_size_bytes = thumb.size_bytes
                await _put_object(
                    bucket=thumb_bucket,
                    key=thumb_key,
                    data=thumb.data,
                    content_type=thumb_content_type,
                )
            except Exception:
                thumb_bucket = None
                thumb_key = None
                thumb_content_type = None
                thumb_size_bytes = 0

        node = FileNode(
            id=file_id,
            name=file.filename,
            is_folder=False,
            parent_id=parent_id,
            workspace_id=workspace_id,
            project_id=project_id,
            created_by=user_id,
            minio_bucket=bucket_name,
            minio_key=object_key,
            content_type=content_type,
            size_bytes=len(data),
            thumb_minio_bucket=thumb_bucket,
            thumb_minio_key=thumb_key,
            thumb_content_type=thumb_content_type,
            thumb_size_bytes=thumb_size_bytes,
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        return node

    async def create_text_file(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        content: str,
        parent_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
        content_type: str = "text/markdown; charset=utf-8",
    ) -> FileNode:
        file_id = uuid4()
        bucket_name = settings.MINIO_BUCKET_VFS
        await _ensure_bucket(bucket_name)
        safe_name = (name or "").strip() or "untitled.md"
        object_key = f"vfs/{workspace_id or 'global'}/{project_id or 'shared'}/{file_id}/{safe_name}"
        data = (content or "").encode("utf-8")
        await _put_object(bucket=bucket_name, key=object_key, data=data, content_type=content_type)

        node = FileNode(
            id=file_id,
            name=safe_name,
            is_folder=False,
            parent_id=parent_id,
            workspace_id=workspace_id,
            project_id=project_id,
            created_by=user_id,
            minio_bucket=bucket_name,
            minio_key=object_key,
            content_type=content_type,
            size_bytes=len(data),
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        return node

    async def read_file_bytes(self, *, db: AsyncSession, user_id: UUID, node_id: UUID) -> tuple[FileNode, bytes]:
        _ = user_id
        node = await db.get(FileNode, node_id)
        if not node or node.is_folder:
            raise AppError(msg="Node not found", code=404, status_code=404)
        if not node.minio_bucket or not node.minio_key:
            raise AppError(msg="File content not available", code=404, status_code=404)

        client = get_minio_client()

        def _op() -> bytes:
            obj = client.get_object(bucket_name=node.minio_bucket, object_name=node.minio_key)
            try:
                return obj.read()
            finally:
                obj.close()
                obj.release_conn()

        data = await run_in_threadpool(_op)
        return node, data

    async def read_thumbnail_bytes(self, *, db: AsyncSession, user_id: UUID, node_id: UUID) -> tuple[FileNode, bytes]:
        _ = user_id
        node = await db.get(FileNode, node_id)
        if not node or node.is_folder:
            raise AppError(msg="Node not found", code=404, status_code=404)
        if not node.thumb_minio_bucket or not node.thumb_minio_key:
            raise AppError(msg="Thumbnail not available", code=404, status_code=404)

        client = get_minio_client()

        def _op() -> bytes:
            obj = client.get_object(bucket_name=node.thumb_minio_bucket, object_name=node.thumb_minio_key)
            try:
                return obj.read()
            finally:
                obj.close()
                obj.release_conn()

        data = await run_in_threadpool(_op)
        return node, data

    async def delete_node(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        node_id: UUID,
        recursive: bool = False,
    ) -> None:
        _ = user_id
        node = await db.get(FileNode, node_id)
        if not node:
            raise AppError(msg="Node not found", code=404, status_code=404)

        async def _delete_subtree(n: FileNode) -> None:
            if n.is_folder:
                res = await db.execute(select(FileNode).where(FileNode.parent_id == n.id))
                children = list(res.scalars().all())
                for ch in children:
                    await _delete_subtree(ch)
            if n.minio_bucket and n.minio_key:
                try:
                    await _remove_object(bucket=n.minio_bucket, key=n.minio_key)
                except Exception:
                    pass
            if n.thumb_minio_bucket and n.thumb_minio_key:
                try:
                    await _remove_object(bucket=n.thumb_minio_bucket, key=n.thumb_minio_key)
                except Exception:
                    pass
            await db.delete(n)

        if node.is_folder and recursive:
            await _delete_subtree(node)
        else:
            if node.is_folder:
                res = await db.execute(select(FileNode).where(FileNode.parent_id == node.id).limit(1))
                if res.scalars().first():
                    raise AppError(msg="Folder not empty", code=400, status_code=400)
            if node.minio_bucket and node.minio_key:
                try:
                    await _remove_object(bucket=node.minio_bucket, key=node.minio_key)
                except Exception:
                    pass
            if node.thumb_minio_bucket and node.thumb_minio_key:
                try:
                    await _remove_object(bucket=node.thumb_minio_bucket, key=node.thumb_minio_key)
                except Exception:
                    pass
            await db.delete(node)

        await db.commit()


vfs_service = VFSService()
