from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas import (
    AIEpisodeAssetExtractionApplyRequest,
    AIEpisodeAssetExtractionPreviewRequest,
    AIEpisodeAssetExtractionPreviewResponse,
    AIEpisodeAssetExtractionPromptPreviewRequest,
    AIEpisodeAssetExtractionPromptPreviewResponse,
)
from app.schemas_response import ResponseBase
from app.services.ai_asset_extraction_service import ai_asset_extraction_service
from app.users import current_active_user


router = APIRouter()


@router.post(
    "/episodes/{episode_id}/ai/asset-extraction/prompt-preview",
    response_model=ResponseBase[AIEpisodeAssetExtractionPromptPreviewResponse],
)
async def preview_asset_extraction_prompt(
    episode_id: UUID,
    body: AIEpisodeAssetExtractionPromptPreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt = await ai_asset_extraction_service.build_prompt_preview(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        prompt_template=body.prompt_template,
    )
    return ResponseBase(code=200, msg="OK", data=AIEpisodeAssetExtractionPromptPreviewResponse(final_prompt=final_prompt))


@router.post(
    "/episodes/{episode_id}/ai/asset-extraction/preview",
    response_model=ResponseBase[AIEpisodeAssetExtractionPreviewResponse],
)
async def preview_asset_extraction(
    episode_id: UUID,
    body: AIEpisodeAssetExtractionPreviewRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    final_prompt, raw_text, world_unity, assets = await ai_asset_extraction_service.preview(
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
        data=AIEpisodeAssetExtractionPreviewResponse(
            final_prompt=final_prompt,
            raw_text=raw_text,
            world_unity=world_unity,
            assets=assets,
        ),
    )


@router.post(
    "/episodes/{episode_id}/ai/asset-extraction/apply",
    response_model=ResponseBase[dict],
)
async def apply_asset_extraction(
    episode_id: UUID,
    body: AIEpisodeAssetExtractionApplyRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    stats = await ai_asset_extraction_service.apply(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        mode=body.mode,
        world_unity=body.world_unity,
        assets=body.assets,
    )
    return ResponseBase(code=200, msg="OK", data=stats)

