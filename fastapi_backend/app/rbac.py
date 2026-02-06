from __future__ import annotations

from collections.abc import Callable, Sequence
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models import Permission, RolePermission, User, UserRole
from app.users import current_active_user


async def get_user_permission_codes(session: AsyncSession, user_id: UUID) -> set[str]:
    rows = (
        await session.execute(
            select(Permission.code)
            .select_from(UserRole)
            .join(RolePermission, RolePermission.role_id == UserRole.role_id)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(UserRole.user_id == user_id)
        )
    ).all()
    return {r[0] for r in rows}


def require_permissions(required: Sequence[str]) -> Callable[[User, AsyncSession], User]:
    async def _dep(
        user: User = Depends(current_active_user),
        session: AsyncSession = Depends(get_async_session),
    ) -> User:
        if getattr(user, "is_superuser", False):
            return user

        codes = await get_user_permission_codes(session, user.id)
        missing = [c for c in required if c not in codes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient_permissions",
            )
        return user

    return _dep

