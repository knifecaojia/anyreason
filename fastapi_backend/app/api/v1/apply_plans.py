from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_tools.apply_plan import ApplyPlan
from app.database import User, get_async_session
from app.models import Episode, FileNode, Project
from app.schemas_response import ResponseBase
from app.services.storage.vfs_service import vfs_service
from app.users import current_active_user
from app.vfs_docs import AssetDocV1, EpisodeBindingsDocV1
from app.vfs_layout import (
    ASSETS_FOLDER_NAME,
    ASSET_TYPE_FOLDER_NAMES,
    BINDINGS_FOLDER_NAME,
    EPISODES_FOLDER_NAME,
    asset_filename,
    bindings_filename,
    episode_filename,
)


router = APIRouter(prefix="/apply-plans")


class ApplyExecuteRequest(BaseModel):
    plan: ApplyPlan
    confirm: bool = Field(default=True)


async def _get_or_create_root_folder(*, db: AsyncSession, user_id: UUID, project_id: UUID, name: str) -> UUID:
    res = await db.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id.is_(None),
            FileNode.is_folder.is_(True),
            FileNode.name == name,
        )
    )
    found = res.scalars().first()
    if found:
        return found.id
    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name=name,
        parent_id=None,
        workspace_id=None,
        project_id=project_id,
    )
    return created.id


async def _get_or_create_child_folder(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    parent_id: UUID,
    name: str,
) -> UUID:
    res = await db.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id == parent_id,
            FileNode.is_folder.is_(True),
            FileNode.name == name,
        )
    )
    found = res.scalars().first()
    if found:
        return found.id
    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name=name,
        parent_id=parent_id,
        workspace_id=None,
        project_id=project_id,
    )
    return created.id


@router.post("/execute", response_model=ResponseBase[dict])
async def api_execute_apply_plan(
    body: ApplyExecuteRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm_required")

    plan = body.plan

    project_id_raw = (plan.inputs or {}).get("project_id")
    if not project_id_raw:
        raise HTTPException(status_code=400, detail="project_id_required")
    try:
        project_id = UUID(str(project_id_raw))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_project_id")

    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project_not_found")
    if project.owner_id and project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="project_not_found")

    if plan.kind == "episode_save" and plan.tool_id == "episode_save":
        episodes = (plan.inputs or {}).get("episodes") or []
        if not isinstance(episodes, list):
            raise HTTPException(status_code=400, detail="invalid_episodes")

        root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=EPISODES_FOLDER_NAME,
        )

        created_nodes: list[dict] = []
        for e in episodes:
            if not isinstance(e, dict):
                continue
            ep_no = int(e.get("episode_number") or 0)
            title = str(e.get("title") or "")
            content_md = str(e.get("content_md") or "")
            if ep_no <= 0:
                continue
            filename = episode_filename(episode_number=ep_no, title=title)
            node = await vfs_service.upsert_text_file(
                db=db,
                user_id=user.id,
                name=filename,
                content=content_md,
                parent_id=root_id,
                workspace_id=None,
                project_id=project_id,
                content_type="text/markdown; charset=utf-8",
            )
            created_nodes.append({"episode_number": ep_no, "node_id": str(node.id), "filename": filename})

            res = await db.execute(
                select(Episode).where(
                    Episode.project_id == project_id,
                    Episode.episode_number == ep_no,
                )
            )
            matched = list(res.scalars().all())
            if len(matched) == 1:
                matched[0].episode_doc_node_id = node.id

        await db.commit()
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_nodes})

    if plan.kind == "asset_create" and plan.tool_id == "asset_create":
        assets_raw = (plan.inputs or {}).get("assets") or []
        if not isinstance(assets_raw, list):
            raise HTTPException(status_code=400, detail="invalid_assets")
        assets: list[AssetDocV1] = []
        for a in assets_raw:
            if not isinstance(a, dict):
                continue
            assets.append(AssetDocV1.model_validate(a))

        assets_root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=ASSETS_FOLDER_NAME,
        )

        created_nodes: list[dict] = []
        for a in assets:
            folder_name = ASSET_TYPE_FOLDER_NAMES.get(a.type)
            if not folder_name:
                continue
            type_folder_id = await _get_or_create_child_folder(
                db=db,
                user_id=user.id,
                project_id=project_id,
                parent_id=assets_root_id,
                name=folder_name,
            )
            filename = asset_filename(asset_type=a.type, name=a.name, asset_id=None)
            content = json.dumps(a.model_dump(), ensure_ascii=False, indent=2)
            node = await vfs_service.create_text_file(
                db=db,
                user_id=user.id,
                name=filename,
                content=content,
                parent_id=type_folder_id,
                workspace_id=None,
                project_id=project_id,
                content_type="application/json; charset=utf-8",
            )
            created_nodes.append({"type": a.type, "name": a.name, "node_id": str(node.id), "filename": filename})
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_nodes})

    if plan.kind == "asset_bind" and plan.tool_id == "asset_bind":
        episode_number = int((plan.inputs or {}).get("episode_number") or 0)
        bindings_doc = (plan.inputs or {}).get("bindings_doc") or {}
        if episode_number <= 0:
            raise HTTPException(status_code=400, detail="invalid_episode_number")

        doc = EpisodeBindingsDocV1.model_validate(bindings_doc)
        bindings_root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=BINDINGS_FOLDER_NAME,
        )
        filename = bindings_filename(episode_number=episode_number)
        content = json.dumps(doc.model_dump(), ensure_ascii=False, indent=2)
        node = await vfs_service.create_text_file(
            db=db,
            user_id=user.id,
            name=filename,
            content=content,
            parent_id=bindings_root_id,
            workspace_id=None,
            project_id=project_id,
            content_type="application/json; charset=utf-8",
        )
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": [{"episode_number": episode_number, "node_id": str(node.id), "filename": filename}]})

    raise HTTPException(status_code=400, detail="unsupported_plan")
