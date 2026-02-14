from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import User, get_async_session
from app.schemas_response import ResponseBase
from app.services.context_builder_service import build_project_asset_context_preview
from app.users import current_active_user


router = APIRouter(prefix="/projects")


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

