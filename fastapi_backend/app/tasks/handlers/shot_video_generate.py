from __future__ import annotations

import base64
import re
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.core.exceptions import AppError
from app.models import FileNode, Project, Task
from app.services.storage.vfs_service import vfs_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", flags=re.IGNORECASE | re.DOTALL)


def _parse_data_url(value: str) -> tuple[str, bytes] | None:
    s = (value or "").strip()
    m = _DATA_URL_RE.match(s)
    if not m:
        return None
    mime = (m.group(1) or "").strip() or "application/octet-stream"
    raw_b64 = (m.group(2) or "").strip()
    try:
        return mime, base64.b64decode(raw_b64, validate=False)
    except Exception:
        return None


async def _download_bytes(url: str, *, max_bytes: int) -> tuple[bytes, str | None]:
    async with httpx_client(timeout_seconds=300.0) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        ct = resp.headers.get("content-type")
        raw = await resp.aread()
        if len(raw) > max_bytes:
            raise RuntimeError("download_too_large")
        return raw, ct


class ShotVideoGenerateHandler(BaseTaskHandler):
    task_type = "shot_video_generate"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        project_id = payload.get("project_id")
        parent_node_id = payload.get("parent_node_id")
        filename = str(payload.get("filename") or "").strip() or "shot.mp4"
        prompt = str(payload.get("prompt") or "").strip()
        duration = payload.get("duration")
        aspect_ratio = payload.get("aspect_ratio")

        binding_key = payload.get("binding_key")
        model_config_id = payload.get("model_config_id")
        images = payload.get("images")

        if not project_id or not parent_node_id:
            raise ValueError("project_id and parent_node_id are required")
        if not prompt:
            raise ValueError("prompt is required")

        try:
            project_uuid = UUID(str(project_id))
            parent_uuid = UUID(str(parent_node_id))
        except Exception:
            raise ValueError("project_id and parent_node_id must be UUID")

        project = await db.get(Project, project_uuid)
        if not project or project.owner_id != task.user_id:
            raise AppError(msg="Not found", code=404, status_code=404)

        parent = await db.get(FileNode, parent_uuid)
        if not parent or not parent.is_folder:
            raise AppError(msg="Node not found", code=404, status_code=404)
        if parent.project_id != project.id:
            raise AppError(msg="scope_mismatch", code=400, status_code=400)

        await reporter.progress(progress=5)
        raw = await ai_gateway_service.generate_video(
            db=db,
            user_id=task.user_id,
            binding_key=binding_key,
            model_config_id=UUID(str(model_config_id)) if model_config_id else None,
            prompt=prompt,
            duration=int(duration) if duration else 5,
            aspect_ratio=str(aspect_ratio) if aspect_ratio else "16:9",
            image_data_urls=list(images) if isinstance(images, list) else None,
        )
        url = str(raw.get("url") or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")

        await reporter.progress(progress=60)

        parsed = _parse_data_url(url)
        if parsed:
            mime, data = parsed
            node = await vfs_service.create_bytes_file(
                db=db,
                user_id=task.user_id,
                name=filename,
                data=data,
                content_type=mime,
                parent_id=parent.id,
                workspace_id=None,
                project_id=project.id,
            )
            await reporter.progress(progress=90)
            return {"url": url, "file_node_id": str(node.id), "raw": raw}

        if url.startswith("http://") or url.startswith("https://"):
            try:
                data, ct = await _download_bytes(url, max_bytes=200 * 1024 * 1024)
                node = await vfs_service.create_bytes_file(
                    db=db,
                    user_id=task.user_id,
                    name=filename,
                    data=data,
                    content_type=ct or "video/mp4",
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=project.id,
                )
                await reporter.progress(progress=90)
                return {"url": url, "file_node_id": str(node.id), "raw": raw}
            except Exception:
                node = await vfs_service.create_text_file(
                    db=db,
                    user_id=task.user_id,
                    name=f"{filename}.url.txt",
                    content=f"url: {url}\n",
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=project.id,
                    content_type="text/plain; charset=utf-8",
                )
                await reporter.progress(progress=90)
                return {"url": url, "file_node_id": str(node.id), "raw": raw}

        node = await vfs_service.create_text_file(
            db=db,
            user_id=task.user_id,
            name=f"{filename}.url.txt",
            content=f"url: {url}\n",
            parent_id=parent.id,
            workspace_id=None,
            project_id=project.id,
            content_type="text/plain; charset=utf-8",
        )
        await reporter.progress(progress=90)
        return {"url": url, "file_node_id": str(node.id), "raw": raw}

