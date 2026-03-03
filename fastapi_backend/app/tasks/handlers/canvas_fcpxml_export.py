"""M5.2: Canvas FCP XML export task handler.

Generates an FCPXML timeline from storyboard-linked canvas nodes,
sorted by shot order, and uploads the XML file to VFS.

input_json schema:
{
    "canvas_id": "uuid",
    "node_ids": ["frontend_node_id", ...],  # optional — empty = all
    "project_name": "optional timeline name",
}

result_json on success:
{
    "xml_file_node_id": "uuid",
    "clip_count": int,
}
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Canvas, CanvasNode, FileNode, Storyboard, Task
from app.services.fcpxml import FcpClip, build_fcpxml
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class CanvasFcpxmlExportHandler(BaseTaskHandler):
    task_type = "canvas_fcpxml_export"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        canvas_id = payload.get("canvas_id")
        requested_ids: list[str] = payload.get("node_ids") or []
        project_name: str = payload.get("project_name", "")

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

        if not project_name:
            project_name = canvas.name or "Canvas Export"

        # Load nodes with storyboard references and output files
        q = (
            select(CanvasNode)
            .where(
                CanvasNode.canvas_id == canvas_uuid,
                CanvasNode.source_storyboard_id.isnot(None),
                CanvasNode.output_file_node_id.isnot(None),
            )
        )
        if requested_ids:
            q = q.where(CanvasNode.frontend_node_id.in_(requested_ids))
        q = q.order_by(CanvasNode.created_at)

        node_result = await db.execute(q)
        nodes = list(node_result.scalars().all())

        if not nodes:
            await reporter.log(message="没有可导出的故事板关联节点", level="warn")
            return {"xml_file_node_id": None, "clip_count": 0}

        await reporter.progress(progress=10, payload={"clip_count": len(nodes)})

        # Load storyboard metadata
        sb_ids = {n.source_storyboard_id for n in nodes if n.source_storyboard_id}
        sb_map: dict[UUID, Storyboard] = {}
        if sb_ids:
            sb_result = await db.execute(select(Storyboard).where(Storyboard.id.in_(sb_ids)))
            for sb in sb_result.scalars().all():
                sb_map[sb.id] = sb

        # Load file references for clip src
        file_ids = {n.output_file_node_id for n in nodes if n.output_file_node_id}
        file_map: dict[UUID, FileNode] = {}
        if file_ids:
            file_result = await db.execute(select(FileNode).where(FileNode.id.in_(file_ids)))
            for fn in file_result.scalars().all():
                file_map[fn.id] = fn

        # Build FcpClip list
        clips: list[FcpClip] = []
        for node in nodes:
            sb = sb_map.get(node.source_storyboard_id) if node.source_storyboard_id else None
            fn = file_map.get(node.output_file_node_id) if node.output_file_node_id else None

            if not fn:
                continue

            duration = 5.0  # default
            if sb and sb.duration_estimate:
                duration = float(sb.duration_estimate)

            file_ref = f"vfs://{fn.id}/{fn.name}" if fn else ""

            markers: list[str] = []
            if sb and sb.description:
                markers.append(f"描述: {sb.description[:80]}")
            if sb and sb.dialogue:
                markers.append(f"台词: {sb.dialogue[:80]}")

            clips.append(FcpClip(
                name=sb.shot_code if sb else node.frontend_node_id[:12],
                file_ref=file_ref,
                duration_seconds=duration,
                shot_code=sb.shot_code if sb else "",
                scene_code=sb.scene_code or "" if sb else "",
                shot_number=sb.shot_number if sb else 0,
                scene_number=sb.scene_number or 0 if sb else 0,
                markers=markers,
            ))

        if not clips:
            await reporter.log(message="没有有效的时间线片段", level="warn")
            return {"xml_file_node_id": None, "clip_count": 0}

        await reporter.progress(progress=50, payload={"building_xml": True})

        # Generate FCPXML
        xml_str = build_fcpxml(clips, project_name=project_name)

        # Upload to VFS
        from app.services.storage.vfs_service import get_or_create_canvas_output_folder, vfs_service

        canvas_folder = await get_or_create_canvas_output_folder(
            db=db, user_id=task.user_id, canvas_id=str(canvas_uuid),
        )

        filename = f"timeline_{project_name}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.fcpxml"
        xml_node = await vfs_service.create_text_file(
            db=db,
            user_id=task.user_id,
            name=filename,
            content=xml_str,
            content_type="application/xml",
            parent_id=canvas_folder.id,
        )

        await reporter.progress(progress=100, payload={"xml_file_node_id": str(xml_node.id)})

        return {
            "xml_file_node_id": str(xml_node.id),
            "clip_count": len(clips),
        }
