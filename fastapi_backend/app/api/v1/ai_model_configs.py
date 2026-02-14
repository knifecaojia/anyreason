from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.audit import write_audit_log
from app.database import User, get_async_session
from app.rbac import require_permissions
from app.schemas_ai_models import (
    AdminAIModelBindingUpsertRequest,
    AdminAIModelConfigCreateRequest,
    AdminAIModelConfigTestChatRequest,
    AdminAIModelConfigTestChatResponse,
    AdminAIModelConfigUpdateRequest,
    AIModelBindingRead,
    AIModelConfigRead,
)
from app.schemas_response import ResponseBase
from app.services.ai_model_config_service import ai_model_binding_service, ai_model_config_service


router = APIRouter()


def _cfg_read(row) -> AIModelConfigRead:
    return AIModelConfigRead(
        id=row.id,
        category=row.category,
        manufacturer=row.manufacturer,
        model=row.model,
        base_url=row.base_url,
        enabled=bool(row.enabled),
        sort_order=int(row.sort_order or 0),
        has_api_key=bool(row.encrypted_api_key),
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
    "/ai/admin/model-configs/{model_config_id}/test-chat/stream",
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_test_model_config_chat_stream(
    model_config_id: UUID,
    body: AdminAIModelConfigTestChatRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def iterator():
        async for evt in ai_gateway_service.chat_text_stream(
            db=db,
            user_id=actor.id,
            binding_key=None,
            model_config_id=model_config_id,
            messages=messages,
            attachments=[],
            credits_cost=0,
        ):
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
