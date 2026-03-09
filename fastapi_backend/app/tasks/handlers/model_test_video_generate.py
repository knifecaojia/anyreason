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


async def _download_bytes(url: str, *, max_bytes: int) -> tuple[bytes, str | None]:
    async with httpx_client(timeout_seconds=300.0) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        ct = resp.headers.get("content-type")
        raw = await resp.aread()
        if len(raw) > max_bytes:
            raise RuntimeError("download_too_large")
        return raw, ct


class ModelTestVideoGenerateHandler(BaseTaskHandler):
    task_type = "model_test_video_generate"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        prompt = str(payload.get("prompt") or "").strip()
        duration = payload.get("duration")
        aspect_ratio = payload.get("aspect_ratio")
        model_config_id = payload.get("model_config_id")
        session_id = payload.get("session_id")
        image_data_urls = payload.get("image_data_urls")
        input_file_node_ids = payload.get("input_file_node_ids") or []

        if not prompt:
            raise ValueError("prompt is required")
        if not session_id:
            raise ValueError("session_id is required")

        image_count = len(image_data_urls) if image_data_urls else 0
        image_sizes = [len(u) for u in (image_data_urls or [])]
        logger.info("[video-handler] task=%s session=%s model_config=%s prompt=%r duration=%s aspect=%s images=%d image_sizes=%s",
                     task.id, session_id, model_config_id, prompt[:200], duration, aspect_ratio, image_count, image_sizes)

        output_node_id: UUID | None = None
        output_ct: str | None = None
        url: str = ""
        raw: dict | None = None
        run_id: str | None = None

        try:
            await reporter.progress(progress=5)
            await reporter.log(message="开始调用 AI 网关生成视频", level="info", payload={
                "model_config_id": model_config_id,
                "image_count": len(image_data_urls) if image_data_urls else 0,
                "prompt_preview": prompt[:100],
            })

            # Build param_json for AI gateway — 优先使用前端传来的完整 param_json
            param_json: dict[str, Any] = dict(payload.get("param_json") or {})
            # 兼容旧字段
            if duration is not None and "duration" not in param_json:
                param_json["duration"] = int(duration)
            if aspect_ratio is not None and "aspect_ratio" not in param_json:
                param_json["aspect_ratio"] = str(aspect_ratio)
            if image_data_urls and "image_data_urls" not in param_json:
                param_json["image_data_urls"] = list(image_data_urls)
            # mode 兜底推断：前端未传 mode 时根据图片数量推断
            if "mode" not in param_json:
                img_count = len(image_data_urls) if image_data_urls else 0
                if img_count == 0:
                    param_json["mode"] = "text2video"
                elif img_count == 1:
                    param_json["mode"] = "image2video"
                elif img_count == 2:
                    param_json["mode"] = "start_end"
                else:
                    param_json["mode"] = "multi_frame"
                logger.info("[video-handler] task=%s inferred mode=%s from %d images", task.id, param_json["mode"], img_count)

            media_resp = await ai_gateway_service.generate_media(
                db=db,
                user_id=task.user_id,
                binding_key=None,
                model_config_id=UUID(str(model_config_id)) if model_config_id else None,
                prompt=prompt,
                param_json=param_json,
                category="video",
            )
            raw = {"url": media_resp.url}
            url = str(media_resp.url or "").strip()
            logger.info("[video-handler] task=%s generate_media returned url_len=%d", task.id, len(url))
            if not url:
                raise RuntimeError("video_url_missing")

            await reporter.progress(progress=50)
            await reporter.log(message="视频生成完成，开始下载保存文件", level="info", payload={"url_len": len(url)})

            # Save file to user's AI folder
            parent = await get_or_create_user_ai_folder(db=db, user_id=task.user_id)
            filename = "generated.mp4"

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
                    project_id=None,
                )
                output_node_id = node.id
                output_ct = mime
            elif url.startswith(("http://", "https://")):
                data, ct = await _download_bytes(url, max_bytes=200 * 1024 * 1024)
                mime = ct or "video/mp4"
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

            await reporter.progress(progress=85)
            await reporter.log(message="文件保存完成，创建 Run 记录", level="info")

            # Create Run record
            run = await ai_model_test_service.add_video_run(
                db=db,
                session_id=UUID(session_id),
                prompt=prompt,
                duration=int(duration) if duration else None,
                aspect_ratio=str(aspect_ratio) if aspect_ratio else None,
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
                await ai_model_test_service.add_video_run(
                    db=db,
                    session_id=UUID(session_id),
                    prompt=prompt,
                    duration=int(duration) if duration else None,
                    aspect_ratio=str(aspect_ratio) if aspect_ratio else None,
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
