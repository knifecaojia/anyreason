from __future__ import annotations

import base64
import logging
import re
from datetime import datetime, timezone
from typing import Any, cast
from uuid import UUID

logger = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.models import BatchVideoAsset, BatchVideoHistory, Task
from app.schemas_media import MediaResponse
from app.services.storage.vfs_service import vfs_service
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


class BatchVideoAssetGenerateHandler(BaseTaskHandler):
    task_type = "batch_video_asset_generate"

    @property
    def supports_two_phase(self) -> bool:
        return True

    async def _get_parent_folder(self, *, db: AsyncSession, user_id: UUID, job_id: UUID) -> Any:
        """Get or create batch video job folder in VFS."""
        from app.models import FileNode
        
        result = await db.execute(
            select(FileNode).where(
                FileNode.name == f"batch-video-{job_id}",
                FileNode.is_folder.is_(True),
            )
        )
        folder = result.scalars().first()
        
        if not folder:
            from app.services.storage.vfs_service import get_or_create_user_ai_folder
            user_ai_folder = await get_or_create_user_ai_folder(db=db, user_id=user_id)
            _folder_parent_id: UUID | None = cast(UUID | None, user_ai_folder.id)
            folder = await vfs_service.create_folder(
                db=db,
                user_id=user_id,
                name=f"batch-video-{job_id}",
                parent_id=_folder_parent_id,
                workspace_id=None,
                project_id=None,
            )
        
        return folder

    async def _save_video(
        self, *, db: AsyncSession, user_id: UUID, job_id: UUID, asset_id: UUID, url: str
    ) -> dict[str, Any]:
        """Download and save video from URL to VFS. Returns result_json."""
        filename = f"asset-{asset_id}.mp4"
        raw = {"url": url}
        parent = await self._get_parent_folder(db=db, user_id=user_id, job_id=job_id)

        parsed = _parse_data_url(url)
        if parsed:
            mime, data = parsed
            node = await vfs_service.create_bytes_file(
                db=db, user_id=user_id, name=filename, data=data,
                content_type=mime, parent_id=parent.id, workspace_id=None,
                project_id=None,
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
                    db=db, user_id=user_id, name=filename, data=data,
                    content_type=ct or "video/mp4", parent_id=parent.id,
                    workspace_id=None, project_id=None,
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}
            except Exception:
                node = await vfs_service.create_text_file(
                    db=db, user_id=user_id, name=f"{filename}.url.txt",
                    content=f"url: {url}\n", parent_id=parent.id,
                    workspace_id=None, project_id=None,
                    content_type="text/plain; charset=utf-8",
                )
                return {"url": url, "file_node_id": str(node.id), "raw": raw}

        node = await vfs_service.create_text_file(
            db=db, user_id=user_id, name=f"{filename}.url.txt",
            content=f"url: {url}\n", parent_id=parent.id,
            workspace_id=None, project_id=None,
            content_type="text/plain; charset=utf-8",
        )
        return {"url": url, "file_node_id": str(node.id), "raw": raw}

    def _build_param_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Build param_json from config and payload."""
        config = payload.get("config", {})
        param_json: dict[str, Any] = {}
        
        param_json["duration"] = config.get("duration", 5)
        param_json["aspect_ratio"] = "16:9"
        
        resolution = config.get("resolution", "1280x720")
        if resolution == "1920x1080":
            param_json["aspect_ratio"] = "16:9"
        elif resolution == "720x1280":
            param_json["aspect_ratio"] = "9:16"
        
        param_json["mode"] = "image2video"
        
        return param_json

    async def _resolve_image_bytes(
        self, db: AsyncSession, user_id: UUID, source_url: str
    ) -> tuple[bytes, str | None]:
        """Resolve image URL to bytes. Handles internal VFS paths and external URLs."""
        import re
        from uuid import UUID as UUIDType
        
        # Check if it's an internal VFS path like /api/v1/vfs/nodes/{uuid}/download
        vfs_match = re.search(r'/api/v1/vfs/nodes/([^/]+)/(?:download|thumbnail)', source_url)
        if vfs_match:
            node_id_str = vfs_match.group(1)
            try:
                node_id = UUIDType(node_id_str)
                node, file_bytes = await vfs_service.read_file_bytes(
                    db=db, user_id=user_id, node_id=node_id
                )
                content_type: str = str(node.content_type) if node.content_type is not None else "image/jpeg"
                return file_bytes, content_type
            except Exception as e:
                raise ValueError(f"Failed to read VFS file: {e}")
        
        # If it's already a data URL, parse it
        if source_url.startswith("data:"):
            parsed = _parse_data_url(source_url)
            if parsed:
                return parsed[1], parsed[0]
            raise ValueError("Invalid data URL format")
        
        # External URL - download it
        if source_url.startswith(("http://", "https://")):
            return await _download_bytes(source_url, max_bytes=20 * 1024 * 1024)
        
        raise ValueError(f"Unsupported source_url format: {source_url}")

    async def submit(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> ExternalSubmitResult:
        """Phase 1: validate inputs, submit to external provider, return ref."""
        _task_user_id: UUID = cast(UUID, task.user_id)
        payload: dict[str, Any] = cast(dict[str, Any], task.input_json) if task.input_json is not None else {}
        job_id = payload.get("job_id")
        asset_id = payload.get("asset_id")
        source_url = payload.get("source_url")
        prompt = str(payload.get("prompt") or "").strip()
        config = payload.get("config", {})
        
        if not job_id or not asset_id:
            raise ValueError("job_id and asset_id are required")
        
        if not source_url:
            raise ValueError("source_url is required")
        
        await reporter.progress(progress=5)
        
        # Download image and convert to base64 data URI for external APIs
        try:
            image_bytes, content_type = await self._resolve_image_bytes(db, _task_user_id, source_url)
            base64_data = base64.b64encode(image_bytes).decode("utf-8")
            data_url = f"data:{content_type or 'image/jpeg'};base64,{base64_data}"
        except Exception as e:
            raise ValueError(f"Failed to download source image: {e}")
        
        await reporter.progress(progress=10)
        
        param_json = self._build_param_json(payload)
        param_json["image_data_urls"] = [data_url]
        
        off_peak = config.get("off_peak", False)
        if off_peak:
            param_json["off_peak"] = True
        
        # Get model_config_id from config (UUID format)
        model_config_id = config.get("model_config_id")
        if model_config_id:
            model_config_id = UUID(str(model_config_id))
        
        # Extract pre-acquired api_key from external_meta (set by process_two_phase_task)
        acquired_api_key = None
        acquired_config_id = None
        external_meta = task.external_meta or {}
        if external_meta.get("_slot_api_key"):
            acquired_api_key = external_meta.get("_slot_api_key")
            acquired_config_id = model_config_id  # Use the resolved config_id
        
        ref = await ai_gateway_service.submit_media_async(
            db=db,
            user_id=_task_user_id,
            binding_key=None,
            model_config_id=model_config_id,
            prompt=prompt,
            param_json=param_json,
            category="video",
            acquired_api_key=acquired_api_key,
            acquired_config_id=acquired_config_id,
        )
        
        return ExternalSubmitResult(
            external_task_id=ref.external_task_id,
            provider=ref.provider,
            meta={
                **(ref.meta or {}),
                "job_id": str(job_id),
                "asset_id": str(asset_id),
            },
        )

    async def on_external_complete(
        self, *, db: AsyncSession, task: Task, reporter: TaskReporter, media_response: MediaResponse,
    ) -> dict[str, Any]:
        """Phase 2: download video and save to VFS."""
        url = str(media_response.url or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")
        
        payload: dict[str, Any] = cast(dict[str, Any], task.input_json) if task.input_json is not None else {}
        job_id = payload.get("job_id")
        asset_id = payload.get("asset_id")
        _task_user_id: UUID = cast(UUID, task.user_id)
        
        await reporter.progress(progress=70)
        
        result = await self._save_video(
            db=db, user_id=_task_user_id, job_id=cast(UUID, job_id), asset_id=cast(UUID, asset_id), url=url
        )
        
        if asset_id:
            asset_uuid = UUID(str(asset_id))
            asset = await db.get(BatchVideoAsset, asset_uuid)
            if asset:
                asset.status = "completed"  # type: ignore
                asset.result_url = url  # type: ignore
                
                history_result = await db.execute(
                    select(BatchVideoHistory).where(
                        BatchVideoHistory.task_id == task.id
                    )
                )
                history = history_result.scalars().first()
                if history:
                    history.status = "completed"  # type: ignore
                    history.result_url = url  # type: ignore
                    history.completed_at = datetime.now(timezone.utc)  # type: ignore
                
                job_result = await db.execute(
                    select(BatchVideoAsset).where(
                        BatchVideoAsset.job_id == asset.job_id,
                        BatchVideoAsset.status == "completed"
                    )
                )
                completed_count = len(list(job_result.scalars().all()))
                
                from app.models import BatchVideoJob
                job = await db.get(BatchVideoJob, asset.job_id)
                if job:
                    job.completed_assets = completed_count  # type: ignore
                    _total: int | None = cast(int | None, job.total_assets)
                    if _total is not None and completed_count >= _total:
                        job.status = "completed"  # type: ignore
                
                await db.commit()
        
        await reporter.progress(progress=90)
        return result

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        """Legacy blocking path (fallback when provider doesn't support async)."""
        _task_user_id: UUID = cast(UUID, task.user_id)
        payload: dict[str, Any] = cast(dict[str, Any], task.input_json) if task.input_json is not None else {}
        job_id = payload.get("job_id")
        asset_id = payload.get("asset_id")
        source_url = payload.get("source_url")
        prompt = str(payload.get("prompt") or "").strip()
        config = payload.get("config", {})
        
        if not job_id or not asset_id:
            raise ValueError("job_id and asset_id are required")
        
        if not source_url:
            raise ValueError("source_url is required")
        
        await reporter.progress(progress=5)

        # Download image and convert to base64 data URI for external APIs
        try:
            image_bytes, content_type = await self._resolve_image_bytes(db, _task_user_id, source_url)
            base64_data = base64.b64encode(image_bytes).decode("utf-8")
            data_url = f"data:{content_type or 'image/jpeg'};base64,{base64_data}"
        except Exception as e:
            raise ValueError(f"Failed to download source image: {e}")

        await reporter.progress(progress=10)

        param_json = self._build_param_json(payload)
        param_json["image_data_urls"] = [data_url]
        
        off_peak = config.get("off_peak", False)
        if off_peak:
            param_json["off_peak"] = True
        
        # Get model_config_id from config (UUID format)
        model_config_id = config.get("model_config_id")
        if model_config_id:
            model_config_id = UUID(str(model_config_id))
        
        media_resp = await ai_gateway_service.generate_media(
            db=db,
            user_id=_task_user_id,
            binding_key=None,
            model_config_id=model_config_id,
            prompt=prompt,
            param_json=param_json,
            category="video",
        )
        
        url = str(media_resp.url or "").strip()
        if not url:
            raise RuntimeError("video_url_missing")
        
        await reporter.progress(progress=60)
        
        _resolved_job_id: UUID | None = cast(UUID | None, job_id) if job_id else None
        _resolved_asset_id: UUID | None = cast(UUID | None, asset_id) if asset_id else None
        result = await self._save_video(
            db=db, user_id=_task_user_id, job_id=cast(UUID, job_id), asset_id=cast(UUID, asset_id), url=url
        )
        
        if asset_id:
            asset_uuid = UUID(str(asset_id))
            asset = await db.get(BatchVideoAsset, asset_uuid)
            if asset:
                asset.status = "completed"  # type: ignore
                asset.result_url = url  # type: ignore
                await db.commit()

        await reporter.progress(progress=90)
        return result

    async def on_fail(self, *, db: AsyncSession, task: Task, error: str) -> None:
        """Reset asset status when task fails. Asset can be retried with new tasks."""
        payload: dict[str, Any] = cast(dict[str, Any], task.input_json) if task.input_json is not None else {}
        asset_id = payload.get("asset_id")

        if asset_id:
            from app.models import BatchVideoAsset, BatchVideoHistory
            from uuid import UUID as UUIDType

            try:
                asset_uuid = UUIDType(str(asset_id))
                asset = await db.get(BatchVideoAsset, asset_uuid)
                if asset:
                    # Only reset status if it was set to generating (legacy)
                    # New logic: asset status stays independent
                    asset_status: str = cast(str, asset.status)
                    if asset_status == "generating":
                        asset.status = "pending"  # type: ignore
                        await db.commit()

                # Update history record if exists
                history_result = await db.execute(
                    select(BatchVideoHistory).where(BatchVideoHistory.task_id == task.id)
                )
                history = history_result.scalars().first()
                if history:
                    history.status = "failed"  # type: ignore
                    history.error_message = error[:500]  # type: ignore
                    await db.commit()

            except Exception as e:
                logger.error("[batch-video] Failed to cleanup on task failure: %s", e)
