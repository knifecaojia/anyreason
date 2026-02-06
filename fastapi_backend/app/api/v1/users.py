from __future__ import annotations

import base64
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi_users.password import PasswordHelper
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models import Role, User, UserRole
from app.schemas_rbac import AvatarUpdate, MePasswordUpdate, MeRead, RoleRead
from app.users import current_active_user


router = APIRouter()


async def _role_list_for_user(session: AsyncSession, user_id: UUID) -> list[Role]:
    rows = (
        await session.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
            .order_by(Role.name.asc())
        )
    ).scalars().all()
    return list(rows)


@router.get("/me", response_model=MeRead)
async def get_me(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> MeRead:
    roles = await _role_list_for_user(session, user.id)
    return MeRead(
        id=user.id,
        email=user.email,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def update_my_password(
    payload: MePasswordUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> Response:
    db_user = (
        await session.execute(select(User).where(User.id == user.id))
    ).scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    helper = PasswordHelper()
    verified, _ = helper.verify_and_update(payload.current_password, db_user.hashed_password)
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_current_password")

    db_user.hashed_password = helper.hash(payload.new_password)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/me/avatar", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def update_my_avatar(
    payload: AvatarUpdate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> Response:
    db_user = (
        await session.execute(select(User).where(User.id == user.id))
    ).scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    try:
        raw = base64.b64decode(payload.data_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_avatar_data")
    if len(raw) > 100 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="avatar_too_large")

    db_user.avatar_content_type = payload.content_type
    db_user.avatar_data = raw
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_my_avatar(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> Response:
    db_user = (
        await session.execute(select(User).where(User.id == user.id))
    ).scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    db_user.avatar_content_type = None
    db_user.avatar_data = None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    _: User = Depends(current_active_user),
) -> Response:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    if not getattr(user, "avatar_data", None) or not getattr(user, "avatar_content_type", None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="avatar_not_found")
    return Response(content=user.avatar_data, media_type=user.avatar_content_type)
