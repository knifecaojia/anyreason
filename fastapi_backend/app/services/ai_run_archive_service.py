from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FileNode, Project
from app.services.storage.vfs_service import vfs_service


@dataclass(frozen=True)
class RunArchiveResult:
    project_id: UUID
    ai_root_node_id: UUID
    run_folder_node_id: UUID
    run_md_node_id: UUID
    run_context_md_node_id: UUID
    plan_json_node_id: UUID
    trace_json_node_id: UUID | None


async def _get_or_create_project_root_folder(*, db: AsyncSession, user_id: UUID, project_id: UUID, name: str) -> UUID:
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


async def archive_ai_run(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    run_label: str,
    run_md: str,
    run_context_md: str,
    plans: list[dict[str, Any]],
    trace_events: list[dict[str, Any]] | None = None,
) -> RunArchiveResult:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise ValueError("project_not_found_or_not_authorized")

    ai_root_id = await _get_or_create_project_root_folder(db=db, user_id=user_id, project_id=project_id, name="AI")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    folder_name = f"{ts}_{(run_label or 'run').strip() or 'run'}_{str(uuid4())[:8]}"
    run_folder = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name=folder_name,
        parent_id=ai_root_id,
        workspace_id=None,
        project_id=project_id,
    )

    run_md_node = await vfs_service.create_text_file(
        db=db,
        user_id=user_id,
        name="run.md",
        content=(run_md or "").rstrip() + "\n",
        parent_id=run_folder.id,
        workspace_id=None,
        project_id=project_id,
        content_type="text/markdown; charset=utf-8",
    )
    ctx_node = await vfs_service.create_text_file(
        db=db,
        user_id=user_id,
        name="run_context.md",
        content=(run_context_md or "").rstrip() + "\n",
        parent_id=run_folder.id,
        workspace_id=None,
        project_id=project_id,
        content_type="text/markdown; charset=utf-8",
    )
    plan_node = await vfs_service.create_text_file(
        db=db,
        user_id=user_id,
        name="plan.json",
        content=json.dumps(plans or [], ensure_ascii=False, indent=2),
        parent_id=run_folder.id,
        workspace_id=None,
        project_id=project_id,
        content_type="application/json; charset=utf-8",
    )

    trace_node_id: UUID | None = None
    if trace_events:
        trace_node = await vfs_service.create_text_file(
            db=db,
            user_id=user_id,
            name="trace.json",
            content=json.dumps(trace_events, ensure_ascii=False, indent=2),
            parent_id=run_folder.id,
            workspace_id=None,
            project_id=project_id,
            content_type="application/json; charset=utf-8",
        )
        trace_node_id = trace_node.id

    return RunArchiveResult(
        project_id=project_id,
        ai_root_node_id=ai_root_id,
        run_folder_node_id=run_folder.id,
        run_md_node_id=run_md_node.id,
        run_context_md_node_id=ctx_node.id,
        plan_json_node_id=plan_node.id,
        trace_json_node_id=trace_node_id,
    )
