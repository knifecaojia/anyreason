from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import AIPromptPresetCreateRequest, AIPromptPresetRead, AIPromptPresetUpdateRequest
from app.schemas_response import ResponseBase
from app.services.ai_prompt_preset_service import ai_prompt_preset_service
from app.users import current_active_user


router = APIRouter()


@router.get("/ai/prompt-presets", response_model=ResponseBase[list[AIPromptPresetRead]])
async def list_prompt_presets(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    tool_key: str | None = Query(default=None),
):
    rows = await ai_prompt_preset_service.list_presets(db=db, user_id=user.id, tool_key=tool_key)
    data = [AIPromptPresetRead.model_validate(r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/ai/prompt-presets", response_model=ResponseBase[AIPromptPresetRead])
async def create_prompt_preset(
    body: AIPromptPresetCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created = await ai_prompt_preset_service.create_preset(
        db=db,
        user_id=user.id,
        tool_key=body.tool_key,
        group=body.group,
        name=body.name,
        provider=body.provider,
        model=body.model,
        prompt_template=body.prompt_template,
        is_default=body.is_default,
    )
    return ResponseBase(code=200, msg="OK", data=AIPromptPresetRead.model_validate(created))


@router.put("/ai/prompt-presets/{preset_id}", response_model=ResponseBase[AIPromptPresetRead])
async def update_prompt_preset(
    preset_id: UUID,
    body: AIPromptPresetUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    patch = body.model_dump(exclude_unset=True)
    # Remove keys that are None, EXCEPT 'group' which may be intentionally set to null
    patch = {k: v for k, v in patch.items() if v is not None or k == "group"}
    if not patch:
        raise AppError(msg="No fields to update", code=400, status_code=400)
    updated = await ai_prompt_preset_service.update_preset(db=db, user_id=user.id, preset_id=preset_id, patch=patch)
    return ResponseBase(code=200, msg="OK", data=AIPromptPresetRead.model_validate(updated))


@router.delete("/ai/prompt-presets/{preset_id}", response_model=ResponseBase[dict])
async def delete_prompt_preset(
    preset_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await ai_prompt_preset_service.delete_preset(db=db, user_id=user.id, preset_id=preset_id)
    if not deleted:
        raise AppError(msg="Preset not found", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"deleted": True})

