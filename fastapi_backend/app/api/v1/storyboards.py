from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Episode, Storyboard
from app.schemas_response import ResponseBase
from app.users import current_active_user
from app.schemas import StoryboardUpdate

router = APIRouter()

@router.patch("/{storyboard_id}", response_model=ResponseBase[dict])
async def update_storyboard(
    storyboard_id: UUID,
    body: StoryboardUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    # Check if storyboard exists
    res = await db.execute(select(Storyboard).where(Storyboard.id == storyboard_id))
    sb = res.scalars().first()
    if not sb:
        raise AppError(code=404, msg="Storyboard not found")

    # If updating episode_id, check if episode exists
    if body.episode_id:
        ep_res = await db.execute(select(Episode).where(Episode.id == body.episode_id))
        ep = ep_res.scalars().first()
        if not ep:
            raise AppError(code=404, msg="Episode not found")

    # Update fields
    values = body.dict(exclude_unset=True)
    if not values:
         return ResponseBase(code=200, msg="No changes", data={"id": storyboard_id})

    await db.execute(update(Storyboard).where(Storyboard.id == storyboard_id).values(**values))
    await db.commit()
    
    return ResponseBase(code=200, msg="Updated", data={"id": storyboard_id})
