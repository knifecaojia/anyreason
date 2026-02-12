from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas import (
    AIModelRead,
    AISceneStructureApplyRequest,
    AISceneStructurePreviewRequest,
    AISceneStructurePreviewResponse,
    AISceneStructurePromptPreviewRequest,
    AISceneStructurePromptPreviewResponse,
)
from app.schemas_response import ResponseBase
from app.services.ai_scene_structure_service import ai_scene_structure_service
from app.users import current_active_user


router = APIRouter()


@router.get("/ai/models", response_model=ResponseBase[list[AIModelRead]])
async def list_ai_models(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    _ = user
    data = [AIModelRead.model_validate(m) for m in (await ai_scene_structure_service.list_models(db=db))]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post(
    "/episodes/{episode_id}/ai/scene-structure/prompt-preview",
    response_model=ResponseBase[AISceneStructurePromptPreviewResponse],
)
async def preview_scene_structure_prompt(
    episode_id: UUID,
    body: AISceneStructurePromptPreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt = await ai_scene_structure_service.build_prompt_preview(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        prompt_template=body.prompt_template,
    )
    return ResponseBase(code=200, msg="OK", data=AISceneStructurePromptPreviewResponse(final_prompt=final_prompt))


@router.post(
    "/episodes/{episode_id}/ai/scene-structure/preview",
    response_model=ResponseBase[AISceneStructurePreviewResponse],
)
async def preview_scene_structure(
    episode_id: UUID,
    body: AISceneStructurePreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt, raw_text, scenes = await ai_scene_structure_service.preview(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        model=body.model,
        prompt_template=body.prompt_template,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
    )
    return ResponseBase(
        code=200,
        msg="OK",
        data=AISceneStructurePreviewResponse(final_prompt=final_prompt, raw_text=raw_text, scenes=scenes),
    )


@router.post(
    "/episodes/{episode_id}/ai/scene-structure/apply",
    response_model=ResponseBase[dict],
)
async def apply_scene_structure(
    episode_id: UUID,
    body: AISceneStructureApplyRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created_count = await ai_scene_structure_service.apply(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        scenes=body.scenes,
        mode=body.mode,
    )
    return ResponseBase(code=200, msg="OK", data={"created_count": created_count})
