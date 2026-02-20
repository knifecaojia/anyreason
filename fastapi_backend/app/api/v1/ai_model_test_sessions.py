from __future__ import annotations

import base64
import re
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.rbac import require_permissions
from app.schemas_ai_models import (
    AIModelTestSessionListItem,
    AIModelTestSessionListResponse,
    AIModelTestSessionRead,
    AdminAIModelTestSessionCreateRequest,
    AIModelTestImageRunRead,
    AIModelTestTextRunRead,
    AIModelTestVideoRunRead,
)
from app.schemas_response import ResponseBase
from app.services.ai_model_test_service import ai_model_test_service
from app.services.storage.vfs_service import vfs_service


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
    return ""


class AdminAIModelTestSessionUploadAttachmentsRequest(BaseModel):
    image_data_urls: list[str] = Field(default_factory=list, max_length=14)


@router.get(
    "/ai/admin/model-test-sessions",
    response_model=ResponseBase[AIModelTestSessionListResponse],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_list_model_test_sessions(
    category: str | None = Query(default=None),
    ai_model_config_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelTestSessionListResponse]:
    sessions, total = await ai_model_test_service.list_sessions(
        db=db,
        user_id=actor.id,
        category=category,
        ai_model_config_id=ai_model_config_id,
        page=page,
        page_size=page_size,
    )
    items = []
    for s in sessions:
        run_count = 0
        if s.category == "image":
            run_count = len(s.image_runs) if getattr(s, "image_runs", None) else 0
        elif s.category == "text":
            run_count = len(getattr(s, "text_runs", None) or [])
        elif s.category == "video":
            run_count = len(getattr(s, "video_runs", None) or [])
        items.append(
            AIModelTestSessionListItem(
                id=s.id,
                category=s.category,  # type: ignore[arg-type]
                ai_model_config_id=s.ai_model_config_id,
                title=s.title,
                created_at=s.created_at,
                updated_at=s.updated_at,
                image_run_count=run_count if s.category == "image" else 0,
                run_count=run_count,
            )
        )
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIModelTestSessionListResponse(items=items, total=total, page=page, page_size=page_size),
    )


@router.post(
    "/ai/admin/model-test-sessions",
    response_model=ResponseBase[AIModelTestSessionRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_create_model_test_session(
    body: AdminAIModelTestSessionCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelTestSessionRead]:
    session = await ai_model_test_service.create_session(
        db=db,
        user_id=actor.id,
        category=body.category,
        ai_model_config_id=body.ai_model_config_id,
        title=body.title,
    )
    await db.commit()
    return ResponseBase(
        code=200,
        msg="OK",
        data=AIModelTestSessionRead(
            id=session.id,
            user_id=session.user_id,
            category=session.category,  # type: ignore[arg-type]
            ai_model_config_id=session.ai_model_config_id,
            title=session.title,
            image_attachment_node_ids=[],
            created_at=session.created_at,
            updated_at=session.updated_at,
            image_runs=[],
            text_runs=[],
            video_runs=[],
        ),
    )


@router.get(
    "/ai/admin/model-test-sessions/{session_id}",
    response_model=ResponseBase[AIModelTestSessionRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_get_model_test_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelTestSessionRead]:
    session = await ai_model_test_service.get_session(db=db, user_id=actor.id, session_id=session_id, with_runs=True)
    if not session:
        return ResponseBase(code=404, msg="not_found", data=None)

    image_runs = []
    for r in session.image_runs or []:
        input_nodes = []
        try:
            raw_ids = list(getattr(r, "input_file_node_ids", None) or [])
        except Exception:
            raw_ids = []
        for x in raw_ids:
            try:
                input_nodes.append(UUID(str(x)))
            except Exception:
                continue
        image_runs.append(
            AIModelTestImageRunRead(
                id=r.id,
                prompt=r.prompt,
                resolution=r.resolution,
                input_image_count=int(r.input_image_count or 0),
                input_file_node_ids=input_nodes,
                output_file_node_id=r.output_file_node_id,
                output_content_type=r.output_content_type,
                output_url=r.output_url,
                error_message=r.error_message,
                raw_payload=r.raw_payload,
                created_at=r.created_at,
            )
        )

    text_runs = []
    for r in getattr(session, "text_runs", None) or []:
        msgs = []
        try:
            msgs = list(getattr(r, "messages", None) or [])
        except Exception:
            msgs = []
        text_runs.append(
            AIModelTestTextRunRead(
                id=r.id,
                messages=msgs,
                output_text=getattr(r, "output_text", None),
                error_message=getattr(r, "error_message", None),
                raw_payload=getattr(r, "raw_payload", None),
                created_at=r.created_at,
            )
        )

    video_runs = []
    for r in getattr(session, "video_runs", None) or []:
        input_nodes = []
        try:
            raw_ids = list(getattr(r, "input_file_node_ids", None) or [])
        except Exception:
            raw_ids = []
        for x in raw_ids:
            try:
                input_nodes.append(UUID(str(x)))
            except Exception:
                continue
        video_runs.append(
            AIModelTestVideoRunRead(
                id=r.id,
                prompt=r.prompt,
                duration=getattr(r, "duration", None),
                aspect_ratio=getattr(r, "aspect_ratio", None),
                input_file_node_ids=input_nodes,
                output_file_node_id=getattr(r, "output_file_node_id", None),
                output_content_type=getattr(r, "output_content_type", None),
                output_url=getattr(r, "output_url", None),
                error_message=getattr(r, "error_message", None),
                raw_payload=getattr(r, "raw_payload", None),
                created_at=r.created_at,
            )
        )
    att_nodes: list[UUID] = []
    try:
        raw_ids = list(getattr(session, "image_attachment_node_ids", None) or [])
    except Exception:
        raw_ids = []
    for x in raw_ids:
        try:
            att_nodes.append(UUID(str(x)))
        except Exception:
            continue

    return ResponseBase(
        code=200,
        msg="OK",
        data=AIModelTestSessionRead(
            id=session.id,
            user_id=session.user_id,
            category=session.category,  # type: ignore[arg-type]
            ai_model_config_id=session.ai_model_config_id,
            title=session.title,
            image_attachment_node_ids=att_nodes,
            created_at=session.created_at,
            updated_at=session.updated_at,
            image_runs=image_runs,
            text_runs=text_runs,
            video_runs=video_runs,
        ),
    )


@router.post(
    "/ai/admin/model-test-sessions/{session_id}/image-attachments",
    response_model=ResponseBase[list[UUID]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_add_model_test_session_image_attachments(
    session_id: UUID,
    body: AdminAIModelTestSessionUploadAttachmentsRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[list[UUID]]:
    session = await ai_model_test_service.get_session(db=db, user_id=actor.id, session_id=session_id, with_runs=False)
    if not session:
        raise AppError(msg="测试会话不存在", code=404, status_code=404)
    if session.category not in {"image", "video"}:
        raise AppError(msg="测试会话类型不匹配", code=400, status_code=400)

    existing: list[str] = []
    try:
        existing = list(getattr(session, "image_attachment_node_ids", None) or [])
    except Exception:
        existing = []
    out_ids: list[UUID] = []
    for x in existing:
        try:
            out_ids.append(UUID(str(x)))
        except Exception:
            continue

    capacity = max(0, 14 - len(out_ids))
    if capacity <= 0:
        return ResponseBase(code=200, msg="OK", data=out_ids)

    for durl in (body.image_data_urls or [])[:capacity]:
        parsed = _parse_data_url(str(durl))
        if not parsed:
            continue
        mime, data = parsed
        name = f"model_test_ref_{uuid4()}{_ext_from_mime(mime) or '.png'}"
        try:
            node = await vfs_service.create_bytes_file(db=db, user_id=actor.id, name=name, data=data, content_type=mime)
            out_ids.append(node.id)
        except Exception:
            continue

    session.image_attachment_node_ids = [str(x) for x in out_ids]
    await db.commit()
    return ResponseBase(code=200, msg="OK", data=out_ids)


@router.delete(
    "/ai/admin/model-test-sessions/{session_id}/image-attachments/{node_id}",
    response_model=ResponseBase[list[UUID]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_remove_model_test_session_image_attachment(
    session_id: UUID,
    node_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[list[UUID]]:
    session = await ai_model_test_service.get_session(db=db, user_id=actor.id, session_id=session_id, with_runs=False)
    if not session:
        raise AppError(msg="测试会话不存在", code=404, status_code=404)
    if session.category not in {"image", "video"}:
        raise AppError(msg="测试会话类型不匹配", code=400, status_code=400)

    out_ids: list[UUID] = []
    try:
        raw_ids = list(getattr(session, "image_attachment_node_ids", None) or [])
    except Exception:
        raw_ids = []
    for x in raw_ids:
        try:
            uid = UUID(str(x))
        except Exception:
            continue
        if uid == node_id:
            continue
        out_ids.append(uid)

    session.image_attachment_node_ids = [str(x) for x in out_ids]
    await db.commit()
    try:
        await vfs_service.delete_node(db=db, user_id=actor.id, node_id=node_id, recursive=False)
    except Exception:
        pass
    return ResponseBase(code=200, msg="OK", data=out_ids)
