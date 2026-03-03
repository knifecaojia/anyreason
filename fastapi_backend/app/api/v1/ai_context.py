from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.models import Project, WorkspaceMember
from app.schemas_response import ResponseBase
from app.services.context_builder_service import build_project_asset_context_preview
from app.users import current_active_user


router = APIRouter(prefix="/projects")


# ---------------------------------------------------------------------------
# GET /projects/accessible — M2.4
# ---------------------------------------------------------------------------

class AccessibleProjectRead(BaseModel):
    id: UUID
    name: str
    owner_id: UUID | None = None
    workspace_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/accessible", response_model=ResponseBase[list[AccessibleProjectRead]])
async def list_accessible_projects(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Return projects the current user can access:
    1. Projects owned by the user (owner_id = user.id)
    2. Projects in workspaces where the user is a member
    """
    workspace_subq = (
        select(WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user.id)
        .correlate(None)
        .scalar_subquery()
    )

    stmt = (
        select(Project)
        .where(
            or_(
                Project.owner_id == user.id,
                Project.workspace_id.in_(workspace_subq),
            )
        )
        .order_by(Project.created_at.desc())
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()
    data = [AccessibleProjectRead.model_validate(p) for p in projects]
    return ResponseBase(data=data)


# ---------------------------------------------------------------------------
# Context preview
# ---------------------------------------------------------------------------

class ContextPreviewRead(BaseModel):
    project_id: UUID
    assets_root_node_id: UUID | None
    counts: dict[str, int] = Field(default_factory=dict)
    samples: dict[str, list[dict]] = Field(default_factory=dict)
    refs: list[str] = Field(default_factory=list)


@router.get("/{project_id}/context/preview", response_model=ResponseBase[ContextPreviewRead])
async def preview_project_context(
    project_id: UUID,
    exclude_types: str | None = Query(None, description="Comma-separated asset types to exclude"),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    excluded = set()
    if exclude_types:
        excluded = {s.strip() for s in exclude_types.split(",") if s.strip()}
    preview = await build_project_asset_context_preview(db=db, user_id=user.id, project_id=project_id, exclude_types=excluded)
    data = ContextPreviewRead(
        project_id=preview.project_id,
        assets_root_node_id=preview.assets_root_node_id,
        counts=preview.counts,
        samples=preview.samples,
        refs=preview.refs,
    )
    return ResponseBase(code=200, msg="OK", data=data)

