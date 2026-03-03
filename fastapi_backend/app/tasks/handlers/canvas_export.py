"""M5.1: Canvas asset-pack export task handler.

Collects generated files from canvas nodes, organises them by storyboard
reference (shot-based dirs) or by node ID (flat), packages into a ZIP with
a manifest.json, and uploads the archive to VFS.

input_json schema:
{
    "canvas_id": "uuid",
    "node_ids": ["frontend_node_id", ...],   # optional — empty = all
}

result_json on success:
{
    "zip_file_node_id": "uuid",
    "manifest": { ... },
    "total_files": int,
}
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models import Canvas, CanvasNode, FileNode, Storyboard, Task
from app.storage.minio_client import get_minio_client
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class CanvasExportHandler(BaseTaskHandler):
    task_type = "canvas_export"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        canvas_id = payload.get("canvas_id")
        requested_ids: list[str] = payload.get("node_ids") or []

        if not canvas_id:
            raise ValueError("canvas_id is required")

        canvas_uuid = UUID(str(canvas_id))

        # Verify canvas
        result = await db.execute(
            select(Canvas).where(Canvas.id == canvas_uuid, Canvas.user_id == task.user_id)
        )
        canvas = result.scalar_one_or_none()
        if canvas is None:
            raise ValueError("Canvas not found or access denied")

        # Load nodes
        q = select(CanvasNode).where(CanvasNode.canvas_id == canvas_uuid)
        if requested_ids:
            q = q.where(CanvasNode.frontend_node_id.in_(requested_ids))
        q = q.order_by(CanvasNode.created_at)
        node_result = await db.execute(q)
        all_nodes = list(node_result.scalars().all())

        # Filter to nodes that have output files
        exportable = [n for n in all_nodes if n.output_file_node_id is not None]
        if not exportable:
            await reporter.log(message="没有可导出的文件", level="warn")
            return {"zip_file_node_id": None, "manifest": {}, "total_files": 0}

        total = len(exportable)
        await reporter.progress(progress=5, payload={"total_files": total})

        # Pre-load storyboard metadata for shot-based organisation
        sb_ids = {n.source_storyboard_id for n in exportable if n.source_storyboard_id}
        sb_map: dict[UUID, Storyboard] = {}
        if sb_ids:
            sb_result = await db.execute(select(Storyboard).where(Storyboard.id.in_(sb_ids)))
            for sb in sb_result.scalars().all():
                sb_map[sb.id] = sb

        # Build ZIP in memory
        buf = io.BytesIO()
        manifest_entries: list[dict[str, Any]] = []

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, node in enumerate(exportable):
                file_node = await db.get(FileNode, node.output_file_node_id)
                if not file_node or not file_node.minio_bucket or not file_node.minio_key:
                    await reporter.log(
                        message=f"跳过节点 {node.frontend_node_id[:8]}… — 文件不可用",
                        level="warn",
                    )
                    continue

                # Read file bytes from MinIO
                file_data = await self._read_minio_object(
                    bucket=file_node.minio_bucket, key=file_node.minio_key
                )

                # Determine archive path
                archive_path = self._build_archive_path(node, file_node, sb_map)
                zf.writestr(archive_path, file_data)

                manifest_entries.append({
                    "archive_path": archive_path,
                    "frontend_node_id": node.frontend_node_id,
                    "node_type": node.node_type,
                    "source_storyboard_id": str(node.source_storyboard_id) if node.source_storyboard_id else None,
                    "source_asset_id": str(node.source_asset_id) if node.source_asset_id else None,
                    "file_name": file_node.name,
                    "content_type": file_node.content_type,
                    "size_bytes": file_node.size_bytes,
                })

                progress_pct = int(5 + (85 * (i + 1) / total))
                await reporter.progress(progress=progress_pct, payload={"current": i + 1, "total": total})

            # Write manifest.json
            manifest = {
                "canvas_id": str(canvas_uuid),
                "canvas_name": canvas.name,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "total_files": len(manifest_entries),
                "files": manifest_entries,
            }
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

        zip_bytes = buf.getvalue()
        buf.close()

        # Upload ZIP to VFS under canvas output folder
        from app.services.storage.vfs_service import get_or_create_canvas_output_folder, vfs_service

        canvas_folder = await get_or_create_canvas_output_folder(
            db=db, user_id=task.user_id, canvas_id=str(canvas_uuid),
        )

        zip_name = f"export_{canvas.name or canvas_uuid}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
        zip_node = await vfs_service.create_bytes_file(
            db=db,
            user_id=task.user_id,
            name=zip_name,
            data=zip_bytes,
            content_type="application/zip",
            parent_id=canvas_folder.id,
        )

        await reporter.progress(progress=100, payload={"zip_file_node_id": str(zip_node.id)})

        return {
            "zip_file_node_id": str(zip_node.id),
            "manifest": manifest,
            "total_files": len(manifest_entries),
        }

    def _build_archive_path(
        self,
        node: CanvasNode,
        file_node: FileNode,
        sb_map: dict[UUID, Storyboard],
    ) -> str:
        """Determine the path inside the ZIP archive for a file.

        - If the node has a storyboard reference: ``{scene_code}/{shot_code}/{filename}``
        - Otherwise: ``nodes/{frontend_node_id[:12]}/{filename}``
        """
        if node.source_storyboard_id and node.source_storyboard_id in sb_map:
            sb = sb_map[node.source_storyboard_id]
            scene_dir = sb.scene_code or "NO_SCENE"
            shot_dir = sb.shot_code or "NO_SHOT"
            return f"{scene_dir}/{shot_dir}/{file_node.name}"
        else:
            nid = node.frontend_node_id[:12]
            return f"nodes/{nid}/{file_node.name}"

    @staticmethod
    async def _read_minio_object(*, bucket: str, key: str) -> bytes:
        client = get_minio_client()

        def _op() -> bytes:
            obj = client.get_object(bucket_name=bucket, object_name=key)
            try:
                return obj.read()
            finally:
                obj.close()
                obj.release_conn()

        return await run_in_threadpool(_op)
