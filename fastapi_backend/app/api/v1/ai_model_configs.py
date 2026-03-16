from __future__ import annotations

import base64
import json
import re
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.ai_gateway.providers.kling_common import httpx_client
from app.audit import write_audit_log
from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.rbac import require_permissions
from app.schemas import TaskCreateRequest
from app.schemas_ai_models import (
    AdminAIModelBindingUpsertRequest,
    AdminAIModelConfigCreateRequest,
    AdminAIModelConfigTestAsyncResponse,
    AdminAIModelConfigTestChatRequest,
    AdminAIModelConfigTestChatResponse,
    AdminAIModelConfigTestImageRequest,
    AdminAIModelConfigTestImageResponse,
    AdminAIModelConfigTestVideoRequest,
    AdminAIModelConfigTestVideoResponse,
    AdminAIModelConfigUpdateRequest,
    AIModelBindingRead,
    AIModelConfigRead,
)
from app.schemas_response import ResponseBase
from app.services.ai_model_config_service import ai_model_binding_service, ai_model_config_service
from app.services.ai_model_test_service import ai_model_test_service
from app.services.storage.vfs_service import vfs_service
from app.services.task_service import task_service


router = APIRouter()


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
    if m == "video/mp4":
        return ".mp4"
    if m == "video/webm":
        return ".webm"
    if m in {"video/quicktime", "video/mov"}:
        return ".mov"
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


def _cfg_read(row) -> AIModelConfigRead:
    return AIModelConfigRead(
        id=row.id,
        category=row.category,
        manufacturer=row.manufacturer,
        model=row.model,
        base_url=row.base_url,
        enabled=bool(row.enabled),
        sort_order=int(row.sort_order or 0),
        has_api_key=bool(row.encrypted_api_key or row.plaintext_api_key or row.api_keys_info),
        plaintext_api_key=row.plaintext_api_key,
        api_keys_info=row.api_keys_info,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/ai/admin/model-configs",
    response_model=ResponseBase[list[AIModelConfigRead]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_list_model_configs(
    category: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AIModelConfigRead]]:
    rows = await ai_model_config_service.list(db=db, category=category)
    return ResponseBase(code=200, msg="OK", data=[_cfg_read(r) for r in rows])


@router.post(
    "/ai/admin/model-configs/{model_config_id}/test-chat",
    response_model=ResponseBase[AdminAIModelConfigTestChatResponse],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_test_model_config_chat(
    model_config_id: UUID,
    body: AdminAIModelConfigTestChatRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AdminAIModelConfigTestChatResponse]:
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    raw = await ai_gateway_service.chat_text(
        db=db,
        user_id=actor.id,
        binding_key=None,
        model_config_id=model_config_id,
        messages=messages,
        attachments=[],
        credits_cost=0,
    )
    output_text = ""
    try:
        output_text = raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        output_text = ""
    return ResponseBase(
        code=200,
        msg="OK",
        data=AdminAIModelConfigTestChatResponse(output_text=str(output_text), raw=raw),
    )


@router.post(
    "/ai/admin/model-configs/{model_config_id}/test-image",
    response_model=ResponseBase[AdminAIModelConfigTestAsyncResponse],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_test_model_config_image(
    model_config_id: UUID,
    body: AdminAIModelConfigTestImageRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AdminAIModelConfigTestAsyncResponse]:
    session = await ai_model_test_service.ensure_session_for_image_test(
        db=db,
        user_id=actor.id,
        model_config_id=model_config_id,
        session_id=body.session_id,
        title=None,
    )

    prompt = body.prompt
    resolution = body.resolution
    input_nodes: list[UUID] = []
    image_data_urls_to_send: list[str] | None = None
    max_bytes = 10 * 1024 * 1024

    if body.attachment_file_node_ids:
        allowed = set()
        try:
            allowed_raw = list(getattr(session, "image_attachment_node_ids", None) or [])
        except Exception:
            allowed_raw = []
        for x in allowed_raw:
            try:
                allowed.add(UUID(str(x)))
            except Exception:
                continue

        image_data_urls_to_send = []
        for node_id in body.attachment_file_node_ids:
            if node_id not in allowed:
                raise AppError(msg="附件不属于该会话", code=400, status_code=400)
            node, data = await vfs_service.read_file_bytes(db=db, user_id=actor.id, node_id=node_id)
            ct = (node.content_type or "application/octet-stream").strip()
            if not ct.lower().startswith("image/"):
                raise AppError(msg="附件不是图片", code=400, status_code=400)
            if len(data) > max_bytes:
                raise AppError(msg="单张图片不能超过 10MB", code=400, status_code=400)
            b64 = base64.b64encode(data).decode("ascii")
            image_data_urls_to_send.append(f"data:{ct};base64,{b64}")
            input_nodes.append(node_id)
    else:
        image_data_urls_to_send = body.image_data_urls
        for idx, durl in enumerate(body.image_data_urls or []):
            parsed = _parse_data_url(str(durl))
            if not parsed:
                continue
            mime, data = parsed
            ext = _ext_from_mime(mime) or ".png"
            name = f"model_test_ref_{idx}{ext}"
            try:
                node = await vfs_service.create_bytes_file(
                    db=db,
                    user_id=actor.id,
                    name=name,
                    data=data,
                    content_type=mime,
                )
                input_nodes.append(node.id)
            except Exception:
                continue

    # 合并 param_json：前端传来的动态参数优先，兼容旧字段
    merged_param_json = dict(body.param_json or {})
    if resolution and "resolution" not in merged_param_json:
        merged_param_json["resolution"] = resolution

    input_json = {
        "prompt": prompt,
        "resolution": resolution,
        "model_config_id": str(model_config_id),
        "session_id": str(session.id),
        "image_data_urls": image_data_urls_to_send,
        "input_file_node_ids": [str(n) for n in input_nodes],
        "param_json": merged_param_json,
    }

    task = await task_service.create_task(
        db=db,
        user_id=actor.id,
        payload=TaskCreateRequest(
            type="model_test_image_generate",
            input_json=input_json,
        ),
    )

    return ResponseBase(
        code=200,
        msg="OK",
        data=AdminAIModelConfigTestAsyncResponse(
            task_id=str(task.id),
            session_id=str(session.id),
        ),
    )


@router.post(
    "/ai/admin/model-configs/{model_config_id}/test-video",
    response_model=ResponseBase[AdminAIModelConfigTestAsyncResponse],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_test_model_config_video(
    model_config_id: UUID,
    body: AdminAIModelConfigTestVideoRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AdminAIModelConfigTestAsyncResponse]:
    session = await ai_model_test_service.ensure_session_for_video_test(
        db=db,
        user_id=actor.id,
        model_config_id=model_config_id,
        session_id=body.session_id,
        title=None,
    )

    prompt = body.prompt
    duration = body.duration
    aspect_ratio = body.aspect_ratio
    input_nodes: list[UUID] = []
    image_data_urls_to_send: list[str] | None = None
    max_bytes = 10 * 1024 * 1024

    if body.attachment_file_node_ids:
        allowed = set()
        try:
            allowed_raw = list(getattr(session, "image_attachment_node_ids", None) or [])
        except Exception:
            allowed_raw = []
        for x in allowed_raw:
            try:
                allowed.add(UUID(str(x)))
            except Exception:
                continue

        image_data_urls_to_send = []
        for node_id in body.attachment_file_node_ids:
            if node_id not in allowed:
                raise AppError(msg="附件不属于该会话", code=400, status_code=400)
            node, data = await vfs_service.read_file_bytes(db=db, user_id=actor.id, node_id=node_id)
            ct = (node.content_type or "application/octet-stream").strip()
            if not ct.lower().startswith("image/"):
                raise AppError(msg="附件不是图片", code=400, status_code=400)
            if len(data) > max_bytes:
                raise AppError(msg="单张图片不能超过 10MB", code=400, status_code=400)
            b64 = base64.b64encode(data).decode("ascii")
            image_data_urls_to_send.append(f"data:{ct};base64,{b64}")
            input_nodes.append(node_id)
    else:
        image_data_urls_to_send = []

    # 合并 param_json：前端传来的动态参数优先，兼容旧字段
    merged_param_json = dict(body.param_json or {})
    if duration is not None and "duration" not in merged_param_json:
        merged_param_json["duration"] = duration
    if aspect_ratio and "aspect_ratio" not in merged_param_json:
        merged_param_json["aspect_ratio"] = aspect_ratio
    if body.mode and "mode" not in merged_param_json:
        merged_param_json["mode"] = body.mode

    input_json = {
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "mode": body.mode,
        "model_config_id": str(model_config_id),
        "session_id": str(session.id),
        "image_data_urls": image_data_urls_to_send,
        "input_file_node_ids": [str(n) for n in input_nodes],
        "param_json": merged_param_json,
    }

    task = await task_service.create_task(
        db=db,
        user_id=actor.id,
        payload=TaskCreateRequest(
            type="model_test_video_generate",
            input_json=input_json,
        ),
    )

    return ResponseBase(
        code=200,
        msg="OK",
        data=AdminAIModelConfigTestAsyncResponse(
            task_id=str(task.id),
            session_id=str(session.id),
        ),
    )


@router.post(
    "/ai/admin/model-configs/{model_config_id}/test-chat/stream",
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_test_model_config_chat_stream(
    model_config_id: UUID,
    body: AdminAIModelConfigTestChatRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
):
    session = await ai_model_test_service.ensure_session_for_text_test(
        db=db,
        user_id=actor.id,
        model_config_id=model_config_id,
        session_id=body.session_id,
        title=None,
    )
    session_id = session.id
    await db.commit()

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def iterator():
        acc = ""
        saved = False
        async for evt in ai_gateway_service.chat_text_stream(
            db=db,
            user_id=actor.id,
            binding_key=None,
            model_config_id=model_config_id,
            messages=messages,
            attachments=[],
            credits_cost=0,
        ):
            if not isinstance(evt, dict):
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode("utf-8")
                continue

            t = str(evt.get("type") or "")
            if t == "delta":
                d = evt.get("delta")
                if isinstance(d, str) and d:
                    acc += d
            if t == "done" and not saved:
                saved = True
                output_text = (acc or (evt.get("output_text") if isinstance(evt.get("output_text"), str) else "") or "").strip()
                run = await ai_model_test_service.add_text_run(
                    db=db,
                    session_id=session_id,
                    messages=messages,
                    output_text=output_text,
                    raw_payload=None,
                    error_message=None,
                )
                await db.commit()
                evt = {**evt, "session_id": str(session_id), "run_id": str(run.id)}
            if t == "error" and not saved:
                saved = True
                msg = evt.get("message")
                err_msg = msg if isinstance(msg, str) and msg else "请求失败"
                run = await ai_model_test_service.add_text_run(
                    db=db,
                    session_id=session_id,
                    messages=messages,
                    output_text=None,
                    raw_payload=None,
                    error_message=err_msg,
                )
                await db.commit()
                evt = {**evt, "session_id": str(session_id), "run_id": str(run.id)}

            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode("utf-8")

    return StreamingResponse(
        iterator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/ai/admin/model-configs",
    response_model=ResponseBase[AIModelConfigRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_create_model_config(
    request: Request,
    body: AdminAIModelConfigCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelConfigRead]:
    row = await ai_model_config_service.create(
        db=db,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        base_url=body.base_url,
        api_key=body.api_key,
        plaintext_api_key=body.plaintext_api_key,
        api_keys_info=body.api_keys_info,
        enabled=body.enabled,
        sort_order=body.sort_order,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model_config.create",
        resource_type="ai_model_config",
        resource_id=row.id,
        meta={"category": row.category, "manufacturer": row.manufacturer, "model": row.model, "enabled": bool(row.enabled)},
    )
    return ResponseBase(code=200, msg="OK", data=_cfg_read(row))


@router.put(
    "/ai/admin/model-configs/{model_config_id}",
    response_model=ResponseBase[AIModelConfigRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_update_model_config(
    request: Request,
    model_config_id: UUID,
    body: AdminAIModelConfigUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelConfigRead]:
    row = await ai_model_config_service.update(db=db, model_config_id=model_config_id, patch=body.model_dump())
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model_config.update",
        resource_type="ai_model_config",
        resource_id=row.id,
        meta={"category": row.category, "manufacturer": row.manufacturer, "model": row.model, "enabled": bool(row.enabled)},
    )
    return ResponseBase(code=200, msg="OK", data=_cfg_read(row))


@router.delete(
    "/ai/admin/model-configs/{model_config_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_delete_model_config(
    request: Request,
    model_config_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[dict]:
    await ai_model_config_service.delete(db=db, model_config_id=model_config_id)
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model_config.delete",
        resource_type="ai_model_config",
        resource_id=model_config_id,
        meta={},
    )
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.get(
    "/ai/admin/bindings",
    response_model=ResponseBase[list[AIModelBindingRead]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_list_bindings(
    category: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AIModelBindingRead]]:
    rows = await ai_model_binding_service.list(db=db, category=category)
    return ResponseBase(code=200, msg="OK", data=[AIModelBindingRead.model_validate(r) for r in rows])


@router.post(
    "/ai/admin/bindings",
    response_model=ResponseBase[AIModelBindingRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_upsert_binding(
    request: Request,
    body: AdminAIModelBindingUpsertRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelBindingRead]:
    row = await ai_model_binding_service.upsert(
        db=db,
        key=body.key,
        category=body.category,
        ai_model_config_id=body.ai_model_config_id,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.binding.upsert",
        resource_type="ai_model_binding",
        resource_id=row.id,
        meta={"key": row.key, "category": row.category, "ai_model_config_id": str(row.ai_model_config_id) if row.ai_model_config_id else None},
    )
    return ResponseBase(code=200, msg="OK", data=AIModelBindingRead.model_validate(row))


@router.delete(
    "/ai/admin/bindings/{binding_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_delete_binding(
    request: Request,
    binding_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[dict]:
    await ai_model_binding_service.delete(db=db, binding_id=binding_id)
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.binding.delete",
        resource_type="ai_model_binding",
        resource_id=binding_id,
        meta={},
    )
    return ResponseBase(code=200, msg="OK", data={"deleted": True})
