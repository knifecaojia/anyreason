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
    # Build param_json from the legacy request fields
    param_json: dict = {}
    if body.resolution is not None:
        param_json["resolution"] = body.resolution
    if body.images:
        param_json["image_data_urls"] = body.images

    response = await ai_gateway_service.generate_media(
        db=db,
        user_id=user.id,
        binding_key=body.binding_key,
        model_config_id=body.model_config_id,
        prompt=body.prompt,
        param_json=param_json,
        category="image",
    )
    return ResponseBase(code=200, msg="OK", data=AIImageGenerateResponse(url=response.url, raw={"url": response.url}))
