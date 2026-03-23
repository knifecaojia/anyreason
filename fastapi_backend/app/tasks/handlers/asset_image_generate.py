from __future__ import annotations

import base64
import os
import re
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.core.exceptions import AppError
from app.models import FileNode, Project, Task
from app.services.storage.vfs_service import vfs_service, get_or_create_user_ai_folder, get_or_create_project_ai_folder
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter
from app.services.ai_model_test_service import ai_model_test_service


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
    return ""


async def _download_bytes(url: str, *, max_bytes: int) -> tuple[bytes, str | None]:
    async with httpx_client(timeout_seconds=120.0) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        ct = resp.headers.get("content-type")
        raw = await resp.aread()
        if len(raw) > max_bytes:
            raise RuntimeError("download_too_large")
        return raw, ct


class AssetImageGenerateHandler(BaseTaskHandler):
    task_type = "asset_image_generate"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        project_id = payload.get("project_id")
        parent_node_id = payload.get("parent_node_id")
        filename = str(payload.get("filename") or "").strip() or "generated.png"
        prompt = str(payload.get("prompt") or "").strip()

        binding_key = payload.get("binding_key")
        model_config_id = payload.get("model_config_id")
        resolution = payload.get("resolution")
        images = payload.get("images")
        session_id = payload.get("session_id")
        attachment_file_node_ids = payload.get("attachment_file_node_ids") or []

        if not prompt:
            raise ValueError("prompt is required")

        project = None
        if project_id:
            try:
                project_uuid = UUID(str(project_id))
            except Exception:
                raise ValueError("project_id must be UUID")
            project = await db.get(Project, project_uuid)
            if not project or project.owner_id != task.user_id:
                raise AppError(msg="Not found", code=404, status_code=404)

        parent: FileNode | None = None
        if parent_node_id:
            try:
                parent_uuid = UUID(str(parent_node_id))
            except Exception:
                raise ValueError("parent_node_id must be UUID")
            parent = await db.get(FileNode, parent_uuid)
            if not parent or not parent.is_folder:
                raise AppError(msg="Node not found", code=404, status_code=404)
            
            if project:
                if parent.project_id and parent.project_id != project.id:
                    raise AppError(msg="scope_mismatch", code=400, status_code=400)
            else:
                if parent.project_id:
                    pass
                elif parent.workspace_id:
                    pass
                else:
                    await vfs_service.list_nodes(db=db, user_id=task.user_id, parent_id=parent.id)
        else:
            if project:
                parent = await get_or_create_project_ai_folder(db=db, user_id=task.user_id, project_id=project.id)
            else:
                parent = await get_or_create_user_ai_folder(db=db, user_id=task.user_id)

        await reporter.progress(progress=5)

        image_data_urls_to_send: list[str] | None = None
        input_nodes: list[UUID] = []
        max_bytes = 10 * 1024 * 1024

        def _ext_from_mime(mime: str) -> str:
            m = (mime or "").lower().strip()
            if m == "image/png":
                return ".png"
            if m in {"image/jpeg", "image/jpg"}:
                return ".jpg"
            if m == "image/webp":
                return ".webp"
            return ""

        def _normalize_filename_ext(name: str, ext: str) -> str:
            if not ext:
                return name
            base, curr_ext = os.path.splitext(name)
            if curr_ext and curr_ext.lower() == ext.lower():
                return name
            if curr_ext:
                # If extension exists but differs, append the correct one
                # unless it is a placeholder like .url.txt handling which is separate
                return f"{base}{ext}"
            return f"{name}{ext}"

        if isinstance(attachment_file_node_ids, list) and attachment_file_node_ids:
            image_data_urls_to_send = []
            for raw_id in attachment_file_node_ids:
                try:
                    uid = UUID(str(raw_id))
                except Exception:
                    continue
                node, data = await vfs_service.read_file_bytes(db=db, user_id=task.user_id, node_id=uid)
                ct = (node.content_type or "application/octet-stream").strip()
                if not ct.lower().startswith("image/"):
                    raise AppError(msg="附件不是图片", code=400, status_code=400)
                if len(data) > max_bytes:
                    raise AppError(msg="单张图片不能超过 10MB", code=400, status_code=400)
                b64 = base64.b64encode(data).decode("ascii")
                image_data_urls_to_send.append(f"data:{ct};base64,{b64}")
                input_nodes.append(uid)
        elif isinstance(images, list) and images:
            image_data_urls_to_send = []
            for idx, durl in enumerate(images):
                s = (str(durl) or "").strip()
                if not s.startswith("data:"):
                    continue
                image_data_urls_to_send.append(s)
        param_json: dict[str, Any] = {}
        if resolution is not None:
            param_json["resolution"] = str(resolution)
        if image_data_urls_to_send:
            param_json["image_data_urls"] = image_data_urls_to_send

        # 透传前端 capParams 中的模型参数（size, seed, watermark, guidance_scale 等）
        _passthrough_keys = ("size", "seed", "watermark", "guidance_scale", "prompt_extend", "batch_count", "resolution_tier", "aspect_ratio")
        for k in _passthrough_keys:
            v = payload.get(k)
            if v is not None:
                param_json[k] = v

        media_resp = await ai_gateway_service.generate_media(
            db=db,
            user_id=task.user_id,
            binding_key=binding_key,
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


        parsed = _parse_data_url(url)
        if parsed:
            mime, data = parsed
            ext = _ext_from_mime(mime)
            filename = _normalize_filename_ext(filename, ext)
            node = await vfs_service.create_bytes_file(
                db=db,
                user_id=task.user_id,
                name=filename,
                data=data,
                content_type=mime,
                parent_id=parent.id,
                workspace_id=None,
                project_id=project.id if project else None,
            )
            await reporter.progress(progress=90)
            if session_id:
                try:
                    sid = UUID(str(session_id))
                    await ai_model_test_service.add_image_run(
                        db=db,
                        session_id=sid,
                        prompt=prompt,
                        resolution=str(resolution) if resolution else None,
                        input_image_count=len(image_data_urls_to_send or []),
                        input_file_node_ids=input_nodes or None,
                        output_file_node_id=node.id,
                        output_content_type=mime,
                        output_url=url,
                        raw_payload=raw if isinstance(raw, dict) else None,
                        error_message=None,
                    )
                    await db.commit()
                except Exception:
                    pass
            return {"url": url, "file_node_id": str(node.id), "raw": raw}

        if url.startswith("http://") or url.startswith("https://"):
            try:
                # 优先用存储提供者下载（避免 bucket 未公开时 403）
                from app.storage import get_storage_provider
                provider = get_storage_provider()
                minio_result = provider.download_by_url(url)
                if minio_result is not None:
                    data, ct = minio_result
                else:
                    data, ct = await _download_bytes(url, max_bytes=50 * 1024 * 1024)
                mime = ct or "application/octet-stream"
                ext = _ext_from_mime(mime)
                filename = _normalize_filename_ext(filename, ext)
                node = await vfs_service.create_bytes_file(
                    db=db,
                    user_id=task.user_id,
                    name=filename,
                    data=data,
                    content_type=mime,
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=project.id if project else None,
                )
                await reporter.progress(progress=90)
                if session_id:
                    try:
                        sid = UUID(str(session_id))
                        await ai_model_test_service.add_image_run(
                            db=db,
                            session_id=sid,
                            prompt=prompt,
                            resolution=str(resolution) if resolution else None,
                            input_image_count=len(image_data_urls_to_send or []),
                            input_file_node_ids=input_nodes or None,
                            output_file_node_id=node.id,
                            output_content_type=mime,
                            output_url=url,
                            raw_payload=raw if isinstance(raw, dict) else None,
                            error_message=None,
                        )
                        await db.commit()
                    except Exception:
                        pass
                return {"url": url, "file_node_id": str(node.id), "raw": raw}
            except Exception:
                meta = f"url: {url}\n"
                node = await vfs_service.create_text_file(
                    db=db,
                    user_id=task.user_id,
                    name=f"{filename}.url.txt",
                    content=meta,
                    parent_id=parent.id,
                    workspace_id=None,
                    project_id=project.id if project else None,
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
            project_id=project.id if project else None,
            content_type="text/plain; charset=utf-8",
        )
        await reporter.progress(progress=90)
        return {"url": url, "file_node_id": str(node.id), "raw": raw}
