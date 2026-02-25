from __future__ import annotations

import base64
import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.models import Task
from app.services.storage.vfs_service import vfs_service, get_or_create_user_ai_folder
from app.services.ai_model_test_service import ai_model_test_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter

logger = logging.getLogger(__name__)


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


def _ext_from_mime(mime: str) -> str:
    m = (mime or "").lower().strip()
    if m == "image/png":
        return ".png"
    if m in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if m == "image/webp":
        return ".webp"
    return ".bin"


async def _download_bytes(url: str, *, max_bytes: int) -> tuple[bytes, str | None]:
    async with httpx_client(timeout_seconds=120.0) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        ct = resp.headers.get("content-type")
        raw = await resp.aread()
        if len(raw) > max_bytes:
            raise RuntimeError("download_too_large")
        return raw, ct


class ModelTestImageGenerateHandler(BaseTaskHandler):
    task_type = "model_test_image_generate"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        resolution = payload.get("resolution")
        model_config_id = payload.get("model_config_id")
        session_id = payload.get("session_id")
        image_data_urls = payload.get("image_data_urls")
        input_file_node_ids = payload.get("input_file_node_ids") or []

        if not prompt:
            raise ValueError("prompt is required")
        if not session_id:
            raise ValueError("session_id is required")

        image_count = len(image_data_urls) if image_data_urls else 0
        logger.info("[image-handler] task=%s session=%s model_config=%s prompt=%r resolution=%s images=%d",
                     task.id, session_id, model_config_id, prompt[:200], resolution, image_count)

        output_node_id: UUID | None = None
        output_ct: str | None = None
        url: str = ""
        raw: dict | None = None
        run_id: str | None = None

        try:
            await reporter.progress(progress=5)

            # Build param_json for AI gateway — 优先使用前端传来的完整 param_json
            param_json: dict[str, Any] = dict(payload.get("param_json") or {})
            # 兼容旧字段：如果 param_json 里没有 resolution，从顶层取
            if resolution is not None and "resolution" not in param_json:
                param_json["resolution"] = str(resolution)
            if image_data_urls and "image_data_urls" not in param_json:
                param_json["image_data_urls"] = list(image_data_urls)

            logger.info("[image-handler] task=%s final param_json=%s", task.id,
                        {k: (f"<{len(str(v))} chars>" if isinstance(v, (list, str)) and len(str(v)) > 200 else v) for k, v in param_json.items()})

            media_resp = await ai_gateway_service.generate_media(
                db=db,
                user_id=task.user_id,
                binding_key=None,
                model_config_id=UUID(str(model_config_id)) if model_config_id else None,
                prompt=prompt,
                param_json=param_json,
                category="image",
            )
            raw = {"url": media_resp.url}
            url = str(media_resp.url or "").strip()
            if not url:
                raise RuntimeError("image_url_missing")

            await reporter.progress(progress=70)

            # Save file to user's AI folder
            parent = await get_or_create_user_ai_folder(db=db, user_id=task.user_id)
            filename = "generated.png"

            parsed = _parse_data_url(url)
            if parsed:
                mime, data = parsed
                ext = _ext_from_mime(mime)
                filename = f"generated{ext}"
                node = await vfs_service.create_bytes_file(
                    db=db,
                    user_id=task.user_id,
                    name=filename,
                    data=data,
                    content_type=mime,
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=None,
                )
                output_node_id = node.id
                output_ct = mime
            elif url.startswith(("http://", "https://")):
                data, ct = await _download_bytes(url, max_bytes=50 * 1024 * 1024)
                mime = ct or "application/octet-stream"
                ext = _ext_from_mime(mime)
                filename = f"generated{ext}"
                node = await vfs_service.create_bytes_file(
                    db=db,
                    user_id=task.user_id,
                    name=filename,
                    data=data,
                    content_type=mime,
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=None,
                )
                output_node_id = node.id
                output_ct = mime

            await reporter.progress(progress=90)

            # Create Run record
            run = await ai_model_test_service.add_image_run(
                db=db,
                session_id=UUID(session_id),
                prompt=prompt,
                resolution=str(resolution) if resolution else None,
                input_image_count=len(image_data_urls or []),
                input_file_node_ids=[UUID(x) for x in (input_file_node_ids or [])],
                output_file_node_id=output_node_id,
                output_content_type=output_ct,
                output_url=url,
                raw_payload=raw,
                error_message=None,
            )
            await db.commit()
            run_id = str(run.id)

            return {
                "url": url,
                "output_file_node_id": str(output_node_id) if output_node_id else None,
                "output_content_type": output_ct,
                "session_id": session_id,
                "run_id": run_id,
            }

        except Exception as exc:
            # Create Run record with error message before re-raising
            try:
                await ai_model_test_service.add_image_run(
                    db=db,
                    session_id=UUID(session_id),
                    prompt=prompt,
                    resolution=str(resolution) if resolution else None,
                    input_image_count=len(image_data_urls or []),
                    input_file_node_ids=[UUID(x) for x in (input_file_node_ids or [])],
                    output_file_node_id=None,
                    output_content_type=None,
                    output_url=None,
                    raw_payload=raw,
                    error_message=str(exc),
                )
                await db.commit()
            except Exception:
                pass
            raise
