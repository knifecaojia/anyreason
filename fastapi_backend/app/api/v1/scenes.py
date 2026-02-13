from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas_response import ResponseBase
from app.schemas_scene_engine import SceneInfoRead
from app.scene_engine import list_scenes, run_scene
from app.users import current_active_user


router = APIRouter(prefix="/scenes")


@router.get("", response_model=ResponseBase[list[SceneInfoRead]])
async def api_list_scenes(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    _ = user
    scenes = await list_scenes(db=db)
    data = [SceneInfoRead(**s.__dict__) for s in scenes]
    return ResponseBase(code=200, msg="OK", data=data)


@router.post("/{scene_code}/run", response_model=ResponseBase[dict])
async def api_run_scene(
    scene_code: str,
    body: dict,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    try:
        result = await run_scene(db=db, user_id=user.id, scene_code=scene_code, payload=body)
    except ValueError as e:
        if str(e) == "scene_not_found":
            raise HTTPException(status_code=404, detail="scene_not_found")
        raise HTTPException(status_code=400, detail="invalid_scene_request")
    return ResponseBase(code=200, msg="OK", data=result.model_dump())

