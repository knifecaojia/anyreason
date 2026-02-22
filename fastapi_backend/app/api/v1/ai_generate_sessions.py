from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import get_async_session, User
from app.schemas_ai_models import AIModelTestSessionRead
from app.schemas_response import ResponseBase
from app.services.ai_model_test_service import ai_model_test_service
from app.services.storage.vfs_service import vfs_service
from app.users import current_active_user


router = APIRouter()


class GenerateSessionCreateRequest(BaseModel):
    category: str = Field(default="image", pattern="^(image)$")
    ai_model_config_id: UUID | None = None
    title: str | None = None


class GenerateSessionUploadAttachmentsRequest(BaseModel):
    image_data_urls: list[str] = Field(default_factory=list, max_length=14)


@router.post("/ai/generate-sessions", response_model=ResponseBase[AIModelTestSessionRead])
async def create_generate_session(
    body: GenerateSessionCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await ai_model_test_service.create_session(
        db=db,
        user_id=user.id,
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


@router.get("/ai/generate-sessions/{session_id}", response_model=ResponseBase[AIModelTestSessionRead])
async def get_generate_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await ai_model_test_service.get_session(db=db, user_id=user.id, session_id=session_id, with_runs=True)
    if not session:
        return ResponseBase(code=404, msg="not_found", data=None)
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
            image_runs=getattr(session, "image_runs", []),
            text_runs=getattr(session, "text_runs", []),
            video_runs=getattr(session, "video_runs", []),
        ),
    )


@router.post("/ai/generate-sessions/{session_id}/image-attachments", response_model=ResponseBase[list[UUID]])
async def add_generate_session_image_attachments(
    session_id: UUID,
    body: GenerateSessionUploadAttachmentsRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await ai_model_test_service.get_session(db=db, user_id=user.id, session_id=session_id, with_runs=False)
    if not session:
        raise AppError(msg="会话不存在", code=404, status_code=404)
    if session.category not in {"image", "video"}:
        raise AppError(msg="会话类型不匹配", code=400, status_code=400)

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

    def _parse_data_url(value: str):
        import base64, re
        m = re.match(r"^data:([^;]+);base64,(.+)$", value, flags=re.IGNORECASE | re.DOTALL)
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

    for durl in (body.image_data_urls or [])[:capacity]:
        parsed = _parse_data_url(str(durl))
        if not parsed:
            continue
        mime, data = parsed
        name = f"session_ref_{uuid4()}{_ext_from_mime(mime) or '.png'}"
        try:
            node = await vfs_service.create_bytes_file(db=db, user_id=user.id, name=name, data=data, content_type=mime)
            out_ids.append(node.id)
        except Exception:
            continue

    session.image_attachment_node_ids = [str(x) for x in out_ids]
    await db.commit()
    return ResponseBase(code=200, msg="OK", data=out_ids)


@router.delete("/ai/generate-sessions/{session_id}/image-attachments/{node_id}", response_model=ResponseBase[list[UUID]])
async def remove_generate_session_image_attachment(
    session_id: UUID,
    node_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await ai_model_test_service.get_session(db=db, user_id=user.id, session_id=session_id, with_runs=False)
    if not session:
        raise AppError(msg="会话不存在", code=404, status_code=404)
    if session.category not in {"image", "video"}:
        raise AppError(msg="会话类型不匹配", code=400, status_code=400)

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
        await vfs_service.delete_node(db=db, user_id=user.id, node_id=node_id, recursive=False)
    except Exception:
        pass
    return ResponseBase(code=200, msg="OK", data=out_ids)

