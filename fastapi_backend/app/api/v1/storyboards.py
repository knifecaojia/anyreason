from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Episode, Storyboard, Project
from app.schemas_response import ResponseBase
from app.users import current_user_via_any
from app.schemas import StoryboardUpdate, StoryboardRead, StoryboardCreateRequest

router = APIRouter()


async def _get_owned_storyboard(*, db: AsyncSession, user_id: UUID, storyboard_id: UUID) -> Storyboard:
    res = await db.execute(
        select(Storyboard)
        .join(Episode)
        .join(Project)
        .where(Storyboard.id == storyboard_id, Project.owner_id == user_id)
    )
    sb = res.scalars().first()
    if not sb:
        raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)
    return sb


@router.patch("/{storyboard_id}", response_model=ResponseBase[dict])
async def update_storyboard(
    storyboard_id: UUID,
    body: StoryboardUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_user_via_any),
):
    """
    Update details of a specific storyboard shot.

    - **storyboard_id**: The UUID of the storyboard.
    - **description**: Visual description of the shot.
    - **dialogue**: Optional lines spoken.
    - **shot_type**: Camera framing.
    - **active_assets**: Updated list of associated asset UUIDs.

    Returns the ID of the updated storyboard.
    """
    sb = await _get_owned_storyboard(db=db, user_id=user.id, storyboard_id=storyboard_id)

    # Update fields
    values = body.model_dump(exclude_unset=True)
    if not values:
         return ResponseBase(code=200, msg="No changes", data={"id": storyboard_id})

    # If updating episode_id, check if episode exists and belongs to user
    if "episode_id" in values and values["episode_id"]:
        ep_id = UUID(str(values["episode_id"]))
        ep_res = await db.execute(
            select(Episode)
            .join(Project)
            .where(Episode.id == ep_id, Project.owner_id == user.id)
        )
        if not ep_res.scalars().first():
            raise AppError(msg="Target episode not found or not authorized", code=404, status_code=404)

    for k, v in values.items():
        setattr(sb, k, v)
    
    await db.commit()
    return ResponseBase(code=200, msg="Updated", data={"id": storyboard_id})


@router.delete("/{storyboard_id}", response_model=ResponseBase[dict])
async def delete_storyboard(
    storyboard_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_user_via_any),
):
    """
    Permanently delete a specific storyboard shot.

    - **storyboard_id**: The UUID of the storyboard to remove.
    """
    sb = await _get_owned_storyboard(db=db, user_id=user.id, storyboard_id=storyboard_id)
    await db.delete(sb)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})
