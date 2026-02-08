from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import (
    LLMChatRequest,
    LLMChatResponse,
    LLMCustomServiceCreateRequest,
    LLMCustomServiceRead,
    LLMUsageDailyRead,
    LLMUsageEventRead,
    LLMModelNewRequest,
    LLMVirtualKeyIssueRequest,
    LLMVirtualKeyIssueResponse,
    LLMVirtualKeyRead,
)
from app.schemas_response import ResponseBase
from app.services.llm_key_service import llm_key_service
from app.services.llm_chat_service import llm_chat_service
from app.services.llm_custom_service_service import llm_custom_service_service
from app.services.llm_model_service import llm_model_service
from app.services.llm_usage_service import llm_usage_service
from app.users import current_active_user
from app.rbac import require_permissions


router = APIRouter()


@router.get("/keys/my", response_model=ResponseBase[list[LLMVirtualKeyRead]])
async def list_my_virtual_keys(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    rows = await llm_key_service.list_my_keys(db=db, user_id=user.id)
    data = [LLMVirtualKeyRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/keys/my/issue", response_model=ResponseBase[LLMVirtualKeyIssueResponse])
async def issue_my_virtual_key(
    body: LLMVirtualKeyIssueRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    token, row = await llm_key_service.issue_my_key(
        db=db,
        user_id=user.id,
        purpose=body.purpose,
        duration_seconds=body.duration_seconds,
    )
    data = LLMVirtualKeyIssueResponse(token=token, record=LLMVirtualKeyRead.model_validate(row))
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/keys/my/rotate", response_model=ResponseBase[LLMVirtualKeyIssueResponse])
async def rotate_my_virtual_key(
    body: LLMVirtualKeyIssueRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    token, row = await llm_key_service.rotate_my_key(
        db=db,
        user_id=user.id,
        purpose=body.purpose,
        duration_seconds=body.duration_seconds,
    )
    data = LLMVirtualKeyIssueResponse(token=token, record=LLMVirtualKeyRead.model_validate(row))
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/keys/my/revoke/{key_id}", response_model=ResponseBase[dict])
async def revoke_my_virtual_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    await llm_key_service.revoke_my_key(db=db, user_id=user.id, key_id=key_id)
    return ResponseBase(code=200, msg="OK", data={"revoked": True})


@router.post("/webhooks/litellm", response_model=ResponseBase[dict])
async def litellm_webhook(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    x_litellm_webhook_secret: str | None = Header(default=None),
):
    if settings.LITELLM_WEBHOOK_SECRET:
        if not x_litellm_webhook_secret or x_litellm_webhook_secret != settings.LITELLM_WEBHOOK_SECRET:
            raise AppError(msg="Unauthorized", code=401, status_code=401)

    payload = await request.json()
    if not isinstance(payload, dict):
        raise AppError(msg="Invalid payload", code=400, status_code=400)

    await llm_usage_service.record_usage(db=db, payload=payload)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"received": True})


@router.get("/usage/my/daily", response_model=ResponseBase[list[LLMUsageDailyRead]])
async def list_my_usage_daily(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    limit: int = Query(90, ge=1, le=365),
):
    rows = await llm_usage_service.list_my_usage_daily(db=db, user_id=user.id, limit=limit)
    data = [LLMUsageDailyRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.get("/usage/my/events", response_model=ResponseBase[list[LLMUsageEventRead]])
async def list_my_usage_events(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    limit: int = Query(200, ge=1, le=1000),
):
    rows = await llm_usage_service.list_my_usage_events(db=db, user_id=user.id, limit=limit)
    data = [LLMUsageEventRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.get(
    "/admin/models",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def admin_list_models() -> ResponseBase[dict]:
    data = await llm_model_service.list_models()
    return ResponseBase(code=200, msg="OK", data=data)


@router.post(
    "/admin/models",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def admin_add_model(body: LLMModelNewRequest) -> ResponseBase[dict]:
    data = await llm_model_service.add_model(
        model_name=body.model_name,
        litellm_params=body.litellm_params,
        model_info=body.model_info,
    )
    return ResponseBase(code=200, msg="OK", data=data)


@router.get(
    "/admin/custom-services",
    response_model=ResponseBase[list[LLMCustomServiceRead]],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def admin_list_custom_services(
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[LLMCustomServiceRead]]:
    rows = await llm_custom_service_service.list_services(db=db)
    data = [LLMCustomServiceRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post(
    "/admin/custom-services",
    response_model=ResponseBase[LLMCustomServiceRead],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def admin_create_custom_service(
    body: LLMCustomServiceCreateRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[LLMCustomServiceRead]:
    row = await llm_custom_service_service.create_openai_compatible_service(
        db=db,
        name=body.name,
        base_url=body.base_url,
        api_key=body.api_key,
        models=body.models,
        enabled=body.enabled,
    )
    return ResponseBase(code=200, msg="OK", data=LLMCustomServiceRead.model_validate(row))


@router.delete(
    "/admin/custom-services/{service_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def admin_delete_custom_service(
    service_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[dict]:
    await llm_custom_service_service.delete_service(db=db, service_id=service_id)
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.post(
    "/chat",
    response_model=ResponseBase[LLMChatResponse],
    dependencies=[Depends(require_permissions(["menu.settings.models"]))],
)
async def chat_completions(
    body: LLMChatRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[LLMChatResponse]:
    raw = await llm_chat_service.chat(
        db=db,
        user_id=user.id,
        model=body.model,
        messages=[m.model_dump() for m in body.messages],
        attachments=[a.model_dump() for a in body.attachments],
    )
    output_text = ""
    try:
        output_text = raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        output_text = ""
    return ResponseBase(code=200, msg="OK", data=LLMChatResponse(output_text=str(output_text), raw=raw))
