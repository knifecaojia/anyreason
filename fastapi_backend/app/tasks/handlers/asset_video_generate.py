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
from app.services.storage.vfs_service import vfs_service, get_or_create_user_ai_folder, get_or_create_project_ai_folder
from app.schemas_media import MediaResponse
from app.tasks.handlers.base import BaseTaskHandler, ExternalSubmitResult
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


class AssetVideoGenerateHandler(BaseTaskHandler):
    task_type = "asset_video_generate"

    @property
    def supports_two_phase(self) -> bool:
        return True

    def _extract_params(self, task: Task) -> dict[str, Any]:
        """Extract and build param_json from task input."""
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        duration = payload.get("duration")
        aspect_ratio = payload.get("aspect_ratio")
        images = payload.get("images")

        param_json: dict[str, Any] = dict(payload.get("param_json") or {})
        if "duration" not in param_json:
            param_json["duration"] = int(duration) if duration else 5
        if "aspect_ratio" not in param_json:
            param_json["aspect_ratio"] = str(aspect_ratio) if aspect_ratio else "16:9"
        if isinstance(images, list) and images and "image_data_urls" not in param_json:
            param_json["image_data_urls"] = list(images)
        if "mode" not in param_json:
            img_count = len(images) if isinstance(images, list) else 0
            if img_count == 0:
                param_json["mode"] = "text2video"
            elif img_count == 1:
                param_json["mode"] = "image2video"
            elif img_count == 2:
                param_json["mode"] = "start_end"
            else:
                param_json["mode"] = "multi_frame"
        return param_json

    async def _resolve_storage(self, *, db: AsyncSession, task: Task) -> tuple[Any, FileNode]:
        """Resolve project and parent folder for saving the video file."""
        payload = task.input_json or {}
        project_id = payload.get("project_id")
        parent_node_id = payload.get("parent_node_id")

        project = None
        if project_id:
            project_uuid = UUID(str(project_id))
            project = await db.get(Project, project_uuid)
            if not project or project.owner_id != task.user_id:
                raise AppError(msg="Not found", code=404, status_code=404)

        parent: FileNode | None = None
        if parent_node_id:
            parent_uuid = UUID(str(parent_node_id))
            parent = await db.get(FileNode, parent_uuid)
            if not parent or not parent.is_folder:
                raise AppError(msg="Node not found", code=404, status_code=404)
            if project and parent.project_id and parent.project_id != project.id:
                raise AppError(msg="scope_mismatch", code=400, status_code=400)
        else:
            if project:
                parent = await get_or_create_project_ai_folder(db=db, user_id=task.user_id, project_id=project.id)
            else:
                parent = await get_or_create_user_ai_folder(db=db, user_id=task.user_id)
        return project, parent  # type: ignore[return-value]

    async def _save_video(self, *, db: AsyncSession, task: Task, url: str, project: Any, parent: FileNode) -> dict[str, Any]:
        """Download and save video from URL to VFS. Returns result_json."""
        payload = task.input_json or {}
        filename = str(payload.get("filename") or "").strip() or "generated.mp4"
        raw = {"url": url}

        parsed = _parse_data_url(url)
        if parsed:
            mime, data = parsed
            node = await vfs_service.create_bytes_file(
                db=db, user_id=task.user_id, name=filename, data=data,
                content_type=mime, parent_id=parent.id, workspace_id=None,
                project_id=project.id if project else None,
            )
            return {"url": url, "file_node_id": str(node.id), "raw": raw}

        if url.startswith("http://") or url.startswith("https://"):
            try:
                from app.storage.minio_client import download_minio_bytes
                minio_result = download_minio_bytes(url)
                if minio_result is not None:
                    data, ct = minio_result
                else:
                    data, ct = await _download_bytes(url, max_bytes=200 * 1024 * 1024)
                node = await vfs_service.create_bytes_file(
                    db=db, user_id=task.user_id, name=filename, data=data,
                    content_type=ct or "video/mp4", parent_id=parent.id,
                    workspace_id=None, project_id=project.id if project else None,
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}
            except Exception:
                node = await vfs_service.create_text_file(
                    db=db, user_id=task.user_id, name=f"{filename}.url.txt",
                    content=f"url: {url}\n", parent_id=parent.id,
                    workspace_id=None, project_id=project.id if project else None,
                    content_type="text/plain; charset=utf-8",
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}

        node = await vfs_service.create_text_file(
            db=db, user_id=task.user_id, name=f"{filename}.url.txt",
            content=f"url: {url}\n", parent_id=parent.id,
            workspace_id=None, project_id=project.id if project else None,
            content_type="text/plain; charset=utf-8",
        )
        return {"url": url, "file_node_id": str(node.id), "raw": raw}

    async def submit(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> ExternalSubmitResult:
        """Phase 1: validate inputs, submit to external provider, return ref."""
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("prompt is required")

        await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=5)

        param_json = self._extract_params(task)
        ref = await ai_gateway_service.submit_media_async(
            db=db,
            user_id=task.user_id,
            binding_key=payload.get("binding_key"),
            model_config_id=UUID(str(payload["model_config_id"])) if payload.get("model_config_id") else None,
            prompt=prompt,
            param_json=param_json,
            category="video",
        )
        return ExternalSubmitResult(
            external_task_id=ref.external_task_id,
            provider=ref.provider,
            meta=ref.meta,
        )

    async def on_external_complete(
        self, *, db: AsyncSession, task: Task, reporter: TaskReporter, media_response: MediaResponse,
    ) -> dict[str, Any]:
        """Phase 2: download video and save to VFS."""
        url = str(media_response.url or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")

        project, parent = await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=70)
        result = await self._save_video(db=db, task=task, url=url, project=project, parent=parent)
        await reporter.progress(progress=90)
        return result

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        """Legacy blocking path (fallback when provider doesn't support async)."""
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("prompt is required")

        project, parent = await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=5)
        param_json = self._extract_params(task)

        media_resp = await ai_gateway_service.generate_media(
            db=db,
            user_id=task.user_id,
            binding_key=payload.get("binding_key"),
            model_config_id=UUID(str(payload["model_config_id"])) if payload.get("model_config_id") else None,
            prompt=prompt,
            param_json=param_json,
            category="video",
        )
        url = str(media_resp.url or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")

        await reporter.progress(progress=60)
        result = await self._save_video(db=db, task=task, url=url, project=project, parent=parent)
        await reporter.progress(progress=90)
        return result
