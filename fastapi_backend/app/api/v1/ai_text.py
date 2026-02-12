from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.database import User, get_async_session
from app.schemas_ai_text import AITextChatRequest, AITextChatResponse
from app.schemas_response import ResponseBase
from app.users import current_active_user


router = APIRouter()


@router.post("/ai/text/chat", response_model=ResponseBase[AITextChatResponse])
async def ai_text_chat(
    body: AITextChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AITextChatResponse]:
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    attachments = [a.model_dump() for a in body.attachments]
    raw = await ai_gateway_service.chat_text(
        db=db,
        user_id=user.id,
        binding_key=body.binding_key,
        model_config_id=body.model_config_id,
        messages=messages,
        attachments=attachments,
    )
    output_text = ""
    try:
        output_text = raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        output_text = ""
    return ResponseBase(code=200, msg="OK", data=AITextChatResponse(output_text=str(output_text), raw=raw))

