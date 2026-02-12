from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.database import User, get_async_session
from app.schemas_ai_image import AIImageGenerateRequest, AIImageGenerateResponse
from app.schemas_response import ResponseBase
from app.users import current_active_user


router = APIRouter()


@router.post("/ai/image/generate", response_model=ResponseBase[AIImageGenerateResponse])
async def ai_generate_image(
    body: AIImageGenerateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[AIImageGenerateResponse]:
    raw = await ai_gateway_service.generate_image(
        db=db,
        user_id=user.id,
        binding_key=body.binding_key,
        model_config_id=body.model_config_id,
        prompt=body.prompt,
        resolution=body.resolution,
        image_data_urls=body.images,
    )
    return ResponseBase(code=200, msg="OK", data=AIImageGenerateResponse(url=str(raw.get("url") or ""), raw=raw))

