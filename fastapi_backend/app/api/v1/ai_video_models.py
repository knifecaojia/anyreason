"""
GET /api/ai/video-models — returns hardcoded video model registry
for frontend UI rendering (CapabilityParams, ModelSelector, etc.)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas_response import ResponseBase
from app.users import current_active_user

from app.ai_gateway.video_registry import (
    list_video_model_specs,
    spec_to_api_dict,
)

router = APIRouter()


@router.get(
    "/ai/video-models",
    response_model=ResponseBase,
    dependencies=[Depends(current_active_user)],
)
async def list_video_models() -> ResponseBase:
    specs = list_video_model_specs()
    return ResponseBase(
        code=200,
        msg="OK",
        data=[spec_to_api_dict(s) for s in specs],
    )
