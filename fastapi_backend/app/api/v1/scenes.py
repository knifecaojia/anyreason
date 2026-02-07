from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas import SceneCreate, SceneRead, SceneUpdate
from app.schemas_response import ResponseBase
from app.services.scene_service import scene_service
from app.users import current_active_user


router = APIRouter()


@router.post("/episodes/{episode_id}/scenes", response_model=ResponseBase[SceneRead])
async def create_scene(
    episode_id: UUID,
    payload: SceneCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    created = await scene_service.create_scene(
        db=db,
        user_id=user.id,
        episode_id=episode_id,
        title=payload.title,
        content=payload.content,
        location=payload.location,
        time_of_day=payload.time_of_day,
    )
    if not created:
        raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=SceneRead.model_validate(created))


@router.patch("/scenes/{scene_id}", response_model=ResponseBase[SceneRead])
async def update_scene(
    scene_id: UUID,
    payload: SceneUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    updated = await scene_service.update_scene(
        db=db,
        user_id=user.id,
        scene_id=scene_id,
        title=payload.title,
        content=payload.content,
        location=payload.location,
        time_of_day=payload.time_of_day,
    )
    if not updated:
        raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data=SceneRead.model_validate(updated))


@router.delete("/scenes/{scene_id}", response_model=ResponseBase[dict])
async def delete_scene(
    scene_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    deleted = await scene_service.delete_scene(db=db, user_id=user.id, scene_id=scene_id)
    if not deleted:
        raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
    return ResponseBase(code=200, msg="OK", data={"message": "Scene successfully deleted"})

