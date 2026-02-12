from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas import (
    AISceneStoryboardApplyRequest,
    AISceneStoryboardPreviewRequest,
    AISceneStoryboardPreviewResponse,
    AISceneStoryboardPromptPreviewRequest,
    AISceneStoryboardPromptPreviewResponse,
)
from app.schemas_response import ResponseBase
from app.services.ai_storyboard_service import ai_storyboard_service
from app.users import current_active_user


router = APIRouter()


@router.post(
    "/storyboards/{storyboard_id}/ai/storyboard/prompt-preview",
    response_model=ResponseBase[AISceneStoryboardPromptPreviewResponse],
)
async def preview_storyboard_prompt(
    storyboard_id: UUID,
    body: AISceneStoryboardPromptPreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt = await ai_storyboard_service.build_prompt_preview(
        db=db,
        user_id=user.id,
        storyboard_id=storyboard_id,
        prompt_template=body.prompt_template,
    )
    return ResponseBase(code=200, msg="OK", data=AISceneStoryboardPromptPreviewResponse(final_prompt=final_prompt))


@router.post(
    "/storyboards/{storyboard_id}/ai/storyboard/preview",
    response_model=ResponseBase[AISceneStoryboardPreviewResponse],
)
async def preview_storyboard(
    storyboard_id: UUID,
    body: AISceneStoryboardPreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt, raw_text, shots = await ai_storyboard_service.preview(
        db=db,
        user_id=user.id,
        storyboard_id=storyboard_id,
        model=body.model,
        prompt_template=body.prompt_template,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
    )
    return ResponseBase(
        code=200,
        msg="OK",
        data=AISceneStoryboardPreviewResponse(final_prompt=final_prompt, raw_text=raw_text, shots=shots),
    )


@router.post(
    "/storyboards/{storyboard_id}/ai/storyboard/apply",
    response_model=ResponseBase[dict],
)
async def apply_storyboard(
    storyboard_id: UUID,
    body: AISceneStoryboardApplyRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created_count = await ai_storyboard_service.apply(
        db=db,
        user_id=user.id,
        storyboard_id=storyboard_id,
        shots=body.shots,
        mode=body.mode,
    )
    return ResponseBase(code=200, msg="OK", data={"created_count": created_count})
