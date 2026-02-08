from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import ShotRead
from app.schemas_response import ResponseBase
from app.services.shot_service import shot_service
from app.users import current_active_user


router = APIRouter()


@router.get("/scenes/{scene_id}/shots", response_model=ResponseBase[list[ShotRead]])
async def list_scene_shots(
    scene_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    shots = await shot_service.list_scene_shots(db=db, user_id=user.id, scene_id=scene_id)
    if shots is None:
        raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=[ShotRead.model_validate(s) for s in shots])


@router.delete("/shots/{shot_id}", response_model=ResponseBase[dict])
async def delete_shot(
    shot_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await shot_service.delete_shot(db=db, user_id=user.id, shot_id=shot_id)
    if not deleted:
        raise AppError(msg="Shot not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"message": "Shot successfully deleted"})

