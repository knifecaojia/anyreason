from __future__ import annotations

from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.schemas_response import ResponseBase
from app.users import current_active_user
from app.schemas import FileNodeRead
from app.services.storage.vfs_service import vfs_service, get_or_create_user_ai_folder, get_or_create_project_ai_folder, AI_GENERATED_FOLDER_NAME

router = APIRouter()


class VfsCreateFolderRequest(BaseModel):
    name: str
    parent_id: UUID | None = None
    workspace_id: UUID | None = None
    project_id: UUID | None = None


class VfsCreateFileRequest(BaseModel):
    name: str
    content: str
    parent_id: UUID | None = None
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    content_type: str | None = None


@router.get("/nodes", response_model=ResponseBase[list[FileNodeRead]])
async def list_nodes(
    parent_id: UUID | None = Query(None),
    workspace_id: UUID | None = Query(None),
    project_id: UUID | None = Query(None),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """List file nodes in a directory."""
    rows = await vfs_service.list_nodes(
        db=db,
        user_id=user.id,
        parent_id=parent_id,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ResponseBase(code=200, msg="OK", data=[FileNodeRead.model_validate(r) for r in rows])


@router.post("/folders", response_model=ResponseBase[FileNodeRead])
async def create_folder(
    body: VfsCreateFolderRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Create a new folder."""
    node = await vfs_service.create_folder(
        db=db,
        user_id=user.id,
        name=body.name,
        parent_id=body.parent_id,
        workspace_id=body.workspace_id,
        project_id=body.project_id,
    )
    return ResponseBase(code=200, msg="OK", data=FileNodeRead.model_validate(node))


@router.post("/files/upload", response_model=ResponseBase[FileNodeRead])
async def upload_file(
    file: UploadFile = File(...),
    parent_id: UUID | None = None,
    workspace_id: UUID | None = None,
    project_id: UUID | None = None,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Upload a file to the virtual file system."""
    node = await vfs_service.upload_file(
        db=db,
        user_id=user.id,
        file=file,
        parent_id=parent_id,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ResponseBase(code=200, msg="OK", data=FileNodeRead.model_validate(node))


@router.post("/files", response_model=ResponseBase[FileNodeRead])
async def create_text_file(
    body: VfsCreateFileRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    node = await vfs_service.create_text_file(
        db=db,
        user_id=user.id,
        name=body.name,
        content=body.content,
        parent_id=body.parent_id,
        workspace_id=body.workspace_id,
        project_id=body.project_id,
        content_type=body.content_type or "text/markdown; charset=utf-8",
    )
    return ResponseBase(code=200, msg="OK", data=FileNodeRead.model_validate(node))


@router.get("/nodes/{node_id}/download")
async def download_node(
    node_id: UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    node, data = await vfs_service.read_file_bytes(db=db, user_id=user.id, node_id=node_id)
    filename = node.name or "file"
    disposition = f"attachment; filename*=UTF-8''{quote(filename)}"

    def iterator():
        yield data

    return StreamingResponse(
        iterator(),
        media_type=node.content_type or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )


@router.get("/nodes/{node_id}/thumbnail")
async def download_node_thumbnail(
    node_id: UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    node, data = await vfs_service.read_thumbnail_bytes(db=db, user_id=user.id, node_id=node_id)
    filename = (node.name or "thumbnail").rsplit(".", 1)[0] + "_thumb"
    disposition = f"inline; filename*=UTF-8''{quote(filename)}"

    def iterator():
        yield data

    return StreamingResponse(
        iterator(),
        media_type=node.thumb_content_type or "image/jpeg",
        headers={"Content-Disposition": disposition},
    )


@router.delete("/nodes/{node_id}")
async def delete_node(
    node_id: UUID,
    recursive: bool = Query(False),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Delete a file or folder (recursively)."""
    try:
        await vfs_service.delete_node(db=db, user_id=user.id, node_id=node_id, recursive=recursive)
    except AppError:
        raise
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


@router.get("/ai-generated", response_model=ResponseBase[list[FileNodeRead]])
async def list_ai_generated_images(
    project_id: UUID | None = Query(None),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """List AI generated images. If project_id given, list that project's AI folder.
    Otherwise list the user-level AI folder AND all project-level AI folders."""
    if project_id:
        folder = await get_or_create_project_ai_folder(db=db, user_id=user.id, project_id=project_id)
        rows = await vfs_service.list_nodes(db=db, user_id=user.id, parent_id=folder.id)
        media_nodes = [
            r for r in rows
            if not r.is_folder and r.content_type and (r.content_type.startswith("image/") or r.content_type.startswith("video/"))
        ]
        return ResponseBase(code=200, msg="OK", data=[FileNodeRead.model_validate(r) for r in media_nodes])

    # Collect from user-level AI folder
    user_folder = await get_or_create_user_ai_folder(db=db, user_id=user.id)
    user_rows = await vfs_service.list_nodes(db=db, user_id=user.id, parent_id=user_folder.id)

    # Collect from all project-level AI folders
    from sqlalchemy import select as sa_select
    from app.models import FileNode as FileNodeModel
    proj_folder_res = await db.execute(
        sa_select(FileNodeModel).where(
            FileNodeModel.name == AI_GENERATED_FOLDER_NAME,
            FileNodeModel.is_folder.is_(True),
            FileNodeModel.created_by == user.id,
            FileNodeModel.project_id.isnot(None),
        )
    )
    proj_folders = list(proj_folder_res.scalars().all())
    proj_rows = []
    for pf in proj_folders:
        rows = await vfs_service.list_nodes(db=db, user_id=user.id, parent_id=pf.id)
        proj_rows.extend(rows)

    all_rows = list(user_rows) + proj_rows
    media_nodes = [
        r for r in all_rows
        if not r.is_folder and r.content_type and (r.content_type.startswith("image/") or r.content_type.startswith("video/"))
    ]
    # Deduplicate by id and sort newest first
    seen = set()
    unique = []
    for n in media_nodes:
        if n.id not in seen:
            seen.add(n.id)
            unique.append(n)
    unique.sort(key=lambda n: n.created_at or n.id, reverse=True)
    return ResponseBase(code=200, msg="OK", data=[FileNodeRead.model_validate(r) for r in unique])
