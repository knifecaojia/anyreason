from __future__ import annotations

import base64
import re
from typing import Any, cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.core.exceptions import AppError
from app.models import FileNode, Project, Task
from app.services.storage.vfs_service import vfs_service
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


class ShotVideoGenerateHandler(BaseTaskHandler):
    task_type = "shot_video_generate"

    @property
    def supports_two_phase(self) -> bool:
        return True

    def _validate_and_extract(self, task: Task) -> tuple[str, dict[str, Any]]:
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        if not payload.get("project_id") or not payload.get("parent_node_id"):
            raise ValueError("project_id and parent_node_id are required")
        if not prompt:
            raise ValueError("prompt is required")
        duration = payload.get("duration")
        aspect_ratio = payload.get("aspect_ratio")
        images = payload.get("images")
        param_json: dict[str, Any] = {
            "duration": int(duration) if duration else 5,
            "aspect_ratio": str(aspect_ratio) if aspect_ratio else "16:9",
        }
        if isinstance(images, list) and images:
            param_json["image_data_urls"] = list(images)
        return prompt, param_json

    async def _resolve_storage(self, *, db: AsyncSession, task: Task) -> tuple[Project, FileNode]:
        payload = task.input_json or {}
        project_uuid = UUID(str(payload["project_id"]))
        parent_uuid = UUID(str(payload["parent_node_id"]))
        project = await db.get(Project, project_uuid)
        if not project:
            raise AppError(msg="Not found", code=404, status_code=404)
        if not cast(bool, project.owner_id.is_(task.user_id)):
            raise AppError(msg="Not found", code=404, status_code=404)
        parent = await db.get(FileNode, parent_uuid)
        if not parent:
            raise AppError(msg="Node not found", code=404, status_code=404)
        if not cast(bool, parent.is_folder):
            raise AppError(msg="Node not found", code=404, status_code=404)
        if not cast(bool, parent.project_id.is_(project.id)):
            raise AppError(msg="scope_mismatch", code=400, status_code=400)
        return project, parent

    async def _save_video(self, *, db: AsyncSession, task: Task, url: str, project: Project, parent: FileNode) -> dict[str, Any]:
        payload = task.input_json or {}
        filename = str(payload.get("filename") or "").strip() or "shot.mp4"
        raw = {"url": url}
        _task_user_id: UUID = cast(UUID, task.user_id)
        _parent_id: UUID = cast(UUID, parent.id)
        _project_id: UUID = cast(UUID, project.id)

        parsed = _parse_data_url(url)
        if parsed:
            mime, data = parsed
            node = await vfs_service.create_bytes_file(
                db=db, user_id=_task_user_id, name=filename, data=data,
                content_type=mime, parent_id=_parent_id, workspace_id=None, project_id=_project_id,
            )
            return {"url": url, "file_node_id": str(node.id), "raw": raw}

        if url.startswith("http://") or url.startswith("https://"):
            try:
                data, ct = await _download_bytes(url, max_bytes=200 * 1024 * 1024)
                node = await vfs_service.create_bytes_file(
                    db=db, user_id=_task_user_id, name=filename, data=data,
                    content_type=ct or "video/mp4", parent_id=_parent_id,
                    workspace_id=None, project_id=_project_id,
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}
            except Exception:
                node = await vfs_service.create_text_file(
                    db=db, user_id=_task_user_id, name=f"{filename}.url.txt",
                    content=f"url: {url}\n", parent_id=_parent_id,
                    workspace_id=None, project_id=_project_id,
                    content_type="text/plain; charset=utf-8",
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}

        node = await vfs_service.create_text_file(
            db=db, user_id=_task_user_id, name=f"{filename}.url.txt",
            content=f"url: {url}\n", parent_id=_parent_id,
            workspace_id=None, project_id=_project_id,
            content_type="text/plain; charset=utf-8",
        )
        return {"url": url, "file_node_id": str(node.id), "raw": raw}

    async def submit(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> ExternalSubmitResult:
        payload = task.input_json or {}
        prompt, param_json = self._validate_and_extract(task)
        await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=5)

        # Extract pre-acquired api_key from external_meta (set by process_two_phase_task)
        acquired_api_key = None
        acquired_config_id = None
        external_meta = task.external_meta or {}
        if external_meta.get("_slot_api_key"):
            acquired_api_key = external_meta.get("_slot_api_key")
            model_config_id_val = payload.get("model_config_id")
            if model_config_id_val:
                acquired_config_id = UUID(str(model_config_id_val))

        _task_user_id: UUID = cast(UUID, task.user_id)

        ref = await ai_gateway_service.submit_media_async(
            db=db,
            user_id=_task_user_id,
            binding_key=payload.get("binding_key"),
            model_config_id=UUID(str(payload["model_config_id"])) if payload.get("model_config_id") else None,
            prompt=prompt,
            param_json=param_json,
            category="video",
            acquired_api_key=acquired_api_key,
            acquired_config_id=acquired_config_id,
        )
        return ExternalSubmitResult(
            external_task_id=ref.external_task_id,
            provider=ref.provider,
            meta=ref.meta,
        )

    async def on_external_complete(
        self, *, db: AsyncSession, task: Task, reporter: TaskReporter, media_response: MediaResponse,
    ) -> dict[str, Any]:
        url = str(media_response.url or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")
        project, parent = await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=70)
        result = await self._save_video(db=db, task=task, url=url, project=project, parent=parent)
        await reporter.progress(progress=90)
        return result

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        """Legacy blocking path."""
        payload = task.input_json or {}
        prompt, param_json = self._validate_and_extract(task)
        project, parent = await self._resolve_storage(db=db, task=task)
        await reporter.progress(progress=5)

        _task_user_id: UUID = cast(UUID, task.user_id)

        media_resp = await ai_gateway_service.generate_media(
            db=db,
            user_id=_task_user_id,
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

