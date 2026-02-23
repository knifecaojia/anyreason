from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, Body, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session, User
from app.models import AIModel, AIManufacturer
from app.users import current_active_user
from app.ai_gateway import ai_gateway_service
from app.schemas_media import MediaResponse
from app.schemas_response import ResponseBase

router = APIRouter()

@router.get("/media/models", response_model=ResponseBase[List[Dict[str, Any]]])
async def list_media_models(
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[List[Dict[str, Any]]]:
    """
    List available media generation models and their parameter schemas.
    """
    query = select(AIModel).join(AIManufacturer).options(joinedload(AIModel.manufacturer)).where(AIModel.enabled == True, AIManufacturer.enabled == True)
    
    if category:
        query = query.where(AIManufacturer.category == category)
        
    result = await db.execute(query)
    models = result.scalars().all()
    
    data = []
    for m in models:
        data.append({
            "id": str(m.id),
            "manufacturer": m.manufacturer.name,
            "manufacturer_code": m.manufacturer.code,
            "model": m.code, # The model key used for generation
            "name": m.name,
            "category": m.manufacturer.category,
            "param_schema": m.param_schema,
            "model_metadata": m.model_metadata,
            "doc_url": m.manufacturer.doc_url
        })
        
    return ResponseBase(code=200, msg="OK", data=data)

@router.post("/media/generate", response_model=ResponseBase[MediaResponse])
async def ai_generate_media(
    prompt: str = Body(..., embed=True),
    model_key: str | None = Body(None),
    negative_prompt: str | None = Body(None),
    param_json: Dict[str, Any] = Body(default_factory=dict),
    callback_url: str | None = Body(None),
    category: str = Body("image"),
    model_config_id: UUID | None = Body(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[MediaResponse]:
    """
    Unified endpoint for AI media generation (Image/Video).
    Supports dynamic parameters via param_json.
    """
    
    result = await ai_gateway_service.generate_media(
        db=db,
        user_id=user.id,
        binding_key=model_key,
        model_config_id=model_config_id,
        prompt=prompt,
        negative_prompt=negative_prompt,
        param_json=param_json,
        callback_url=callback_url,
        category=category,
    )
    return ResponseBase(code=200, msg="OK", data=result)
