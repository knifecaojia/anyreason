from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users import current_active_user as current_user
from app.database import get_async_session as get_db
from app.models import User, WorkspaceMember


class PermissionGuard:
    def __init__(self, required_role: str = "member"):
        self.required_role = required_role

    async def __call__(
        self,
        workspace_id: UUID,
        user: User = Depends(current_user),
        db: AsyncSession = Depends(get_db),
    ) -> WorkspaceMember:
        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
        member = result.scalars().first()

        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this workspace",
            )

        if not self._check_role(member.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return member

    def _check_role(self, user_role: str) -> bool:
        roles = ["member", "admin", "owner"]
        try:
            user_idx = roles.index(user_role)
            required_idx = roles.index(self.required_role)
            return user_idx >= required_idx
        except ValueError:
            return False


# Dependencies
require_workspace_member = PermissionGuard("member")
require_workspace_admin = PermissionGuard("admin")
require_workspace_owner = PermissionGuard("owner")
