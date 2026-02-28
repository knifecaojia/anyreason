from __future__ import annotations

import importlib.resources
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Episode, FileNode, Project, Script
from app.schemas import EpisodeCreateRequest, EpisodeMutateRead, EpisodeUpdateRequest
from app.schemas_response import ResponseBase
from app.services.storage.vfs_service import vfs_service
from app.users import current_active_user
from app.vfs_layout import EPISODES_FOLDER_NAME, episode_filename


router = APIRouter()


def _episode_code(episode_number: int) -> str:
    return f"EP{episode_number:03d}"


async def _ensure_script_project(*, db: AsyncSession, user_id: UUID, script_id: UUID) -> Project:
    res = await db.execute(
        select(Script).where(
            Script.id == script_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    script = res.scalars().first()
    if not script:
        raise AppError(msg="Script not found or not authorized", code=404, status_code=404)

    if script.project_id:
        project = await db.get(Project, script.project_id)
        if project:
            return project

    project = await db.get(Project, script_id)
    if project:
        if not script.project_id:
            script.project_id = project.id
            await db.flush()
        return project

    project = Project(id=script_id, owner_id=user_id, name=script.title)
    db.add(project)
    await db.flush()
    if not script.project_id:
        script.project_id = project.id
        await db.flush()
    return project


async def _get_owned_episode(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> Episode:
    res = await db.execute(select(Episode).where(Episode.id == episode_id))
    ep = res.scalars().first()
    if not ep:
        raise AppError(msg="Episode not found", code=404, status_code=404)
    if not ep.project_id:
        raise AppError(msg="Episode not bound to project", code=400, status_code=400)
    project = await db.get(Project, ep.project_id)
    if not project or project.owner_id != user_id:
        raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)
    return ep


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


def _count_non_whitespace_chars(value: str) -> int:
    return sum(1 for ch in (value or "") if not ch.isspace())


_EPISODE_DOC_TEMPLATE: str | None = None


def _get_episode_doc_template() -> str:
    global _EPISODE_DOC_TEMPLATE
    if _EPISODE_DOC_TEMPLATE is not None:
        return _EPISODE_DOC_TEMPLATE
    text = importlib.resources.files("app.vfs_templates").joinpath("episode_doc.md").read_text(encoding="utf-8")
    _EPISODE_DOC_TEMPLATE = text
    return text


def _build_episode_markdown(*, ep: Episode) -> str:
    title = (ep.title or "").strip()
    safe_title = title.replace("\n", " ").strip()
    body = (ep.script_full_text or "").strip("\n")
    tpl = _get_episode_doc_template()
    out = tpl
    out = out.replace("{{episode_number}}", str(int(ep.episode_number)))
    out = out.replace("{{episode_number_padded}}", f"{int(ep.episode_number):03d}")
    out = out.replace("{{episode_code}}", ep.episode_code)
    out = out.replace("{{title}}", safe_title)
    out = out.replace("{{source}}", "db/script_full_text")
    out = out.replace("{{body}}", body)
    return out.rstrip() + "\n"


class EpisodeDocResponse(BaseModel):
    episode_id: UUID
    node_id: UUID
    filename: str
    content_md: str


class EpisodeDocUpdateRequest(BaseModel):
    content_md: str = Field(default="", description="Episode Markdown 正文（SSOT）")


@router.get("/episodes/{episode_id}/doc", response_model=ResponseBase[EpisodeDocResponse])
async def get_episode_doc(
    episode_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ep = await _get_owned_episode(db=db, user_id=user.id, episode_id=episode_id)
    if not ep.project_id:
        raise AppError(msg="Episode not bound to project", code=400, status_code=400)

    if ep.episode_doc_node_id:
        node, data = await vfs_service.read_file_bytes(db=db, user_id=user.id, node_id=ep.episode_doc_node_id)
        content_md = data.decode("utf-8", errors="replace")
        return ResponseBase(
            code=200,
            msg="OK",
            data=EpisodeDocResponse(
                episode_id=ep.id,
                node_id=node.id,
                filename=node.name or episode_filename(episode_number=ep.episode_number, title=ep.title),
                content_md=content_md,
            ),
        )

    episodes_root_id = await _get_or_create_project_root_folder(
        db=db,
        user_id=user.id,
        project_id=ep.project_id,
        name=EPISODES_FOLDER_NAME,
    )
    filename = episode_filename(episode_number=ep.episode_number, title=ep.title)
    content_md = _build_episode_markdown(ep=ep)
    node = await vfs_service.upsert_text_file(
        db=db,
        user_id=user.id,
        name=filename,
        content=content_md,
        parent_id=episodes_root_id,
        workspace_id=None,
        project_id=ep.project_id,
        content_type="text/markdown; charset=utf-8",
    )
    ep.episode_doc_node_id = node.id
    ep.word_count = _count_non_whitespace_chars(content_md)
    await db.commit()
    await db.refresh(ep)
    return ResponseBase(
        code=200,
        msg="OK",
        data=EpisodeDocResponse(episode_id=ep.id, node_id=node.id, filename=node.name or filename, content_md=content_md),
    )


@router.put("/episodes/{episode_id}/doc", response_model=ResponseBase[EpisodeDocResponse])
async def put_episode_doc(
    episode_id: UUID,
    body: EpisodeDocUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ep = await _get_owned_episode(db=db, user_id=user.id, episode_id=episode_id)
    if not ep.project_id:
        raise AppError(msg="Episode not bound to project", code=400, status_code=400)

    content_md = (body.content_md or "").rstrip() + "\n"
    if ep.episode_doc_node_id:
        node = await db.get(FileNode, ep.episode_doc_node_id)
        if not node or node.is_folder or not node.parent_id:
            raise AppError(msg="Episode doc node not found", code=404, status_code=404)
        desired_filename = episode_filename(episode_number=ep.episode_number, title=ep.title)
        if node.name != desired_filename:
            res = await db.execute(
                select(FileNode).where(
                    FileNode.parent_id == node.parent_id,
                    FileNode.is_folder.is_(False),
                    FileNode.name == desired_filename,
                )
            )
            existing = res.scalars().first()
            if existing is None or existing.id == node.id:
                node.name = desired_filename
                await db.flush()
        written = await vfs_service.upsert_text_file(
            db=db,
            user_id=user.id,
            name=node.name,
            content=content_md,
            parent_id=node.parent_id,
            workspace_id=node.workspace_id,
            project_id=node.project_id,
            content_type="text/markdown; charset=utf-8",
        )
        ep.word_count = _count_non_whitespace_chars(content_md)
        await db.commit()
        await db.refresh(ep)
        return ResponseBase(
            code=200,
            msg="OK",
            data=EpisodeDocResponse(episode_id=ep.id, node_id=written.id, filename=written.name, content_md=content_md),
        )

    episodes_root_id = await _get_or_create_project_root_folder(
        db=db,
        user_id=user.id,
        project_id=ep.project_id,
        name=EPISODES_FOLDER_NAME,
    )
    filename = episode_filename(episode_number=ep.episode_number, title=ep.title)
    written = await vfs_service.upsert_text_file(
        db=db,
        user_id=user.id,
        name=filename,
        content=content_md,
        parent_id=episodes_root_id,
        workspace_id=None,
        project_id=ep.project_id,
        content_type="text/markdown; charset=utf-8",
    )
    ep.episode_doc_node_id = written.id
    ep.word_count = _count_non_whitespace_chars(content_md)
    await db.commit()
    await db.refresh(ep)
    return ResponseBase(
        code=200,
        msg="OK",
        data=EpisodeDocResponse(episode_id=ep.id, node_id=written.id, filename=written.name, content_md=content_md),
    )


@router.post("/scripts/{script_id}/episodes", response_model=ResponseBase[EpisodeMutateRead])
async def create_episode(
    script_id: UUID,
    body: EpisodeCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    project = await _ensure_script_project(db=db, user_id=user.id, script_id=script_id)

    after_episode: Episode | None = None
    if body.after_episode_id:
        res = await db.execute(
            select(Episode).where(
                Episode.id == body.after_episode_id,
                Episode.project_id == project.id,
            )
        )
        after_episode = res.scalars().first()
        if not after_episode:
            raise AppError(msg="after_episode_id invalid", code=400, status_code=400)

    if after_episode:
        insert_number = int(after_episode.episode_number) + 1
        res = await db.execute(
            select(Episode)
            .where(Episode.project_id == project.id, Episode.episode_number >= insert_number)
            .order_by(Episode.episode_number.desc())
        )
        to_shift = list(res.scalars().all())
        for ep in to_shift:
            ep.episode_number = int(ep.episode_number) + 1
            ep.episode_code = _episode_code(int(ep.episode_number))
        await db.flush()
    else:
        res = await db.execute(
            select(Episode.episode_number)
            .where(Episode.project_id == project.id)
            .order_by(Episode.episode_number.desc())
            .limit(1)
        )
        max_num = res.scalar_one_or_none()
        insert_number = int(max_num or 0) + 1

    created = Episode(
        project_id=project.id,
        episode_number=insert_number,
        episode_code=_episode_code(insert_number),
        title=body.title,
        script_full_text=body.script_full_text,
    )
    db.add(created)
    await db.commit()
    await db.refresh(created)
    return ResponseBase(code=200, msg="OK", data=EpisodeMutateRead.model_validate(created))


@router.patch("/episodes/{episode_id}", response_model=ResponseBase[EpisodeMutateRead])
async def update_episode(
    episode_id: UUID,
    body: EpisodeUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ep = await _get_owned_episode(db=db, user_id=user.id, episode_id=episode_id)
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch:
        ep.title = patch["title"]
    if "script_full_text" in patch:
        ep.script_full_text = patch["script_full_text"]
    await db.commit()
    await db.refresh(ep)
    return ResponseBase(code=200, msg="OK", data=EpisodeMutateRead.model_validate(ep))


@router.delete("/episodes/{episode_id}", response_model=ResponseBase[dict])
async def delete_episode(
    episode_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    ep = await _get_owned_episode(db=db, user_id=user.id, episode_id=episode_id)
    project_id = ep.project_id
    deleted_number = int(ep.episode_number)
    await db.delete(ep)
    await db.flush()

    res = await db.execute(
        select(Episode)
        .where(Episode.project_id == project_id, Episode.episode_number > deleted_number)
        .order_by(Episode.episode_number.asc())
    )
    for row in res.scalars().all():
        row.episode_number = int(row.episode_number) - 1
        row.episode_code = _episode_code(int(row.episode_number))

    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


UNASSIGNED_EPISODE_CODE = "UNASSIGNED"


@router.get("/scripts/{script_id}/episodes/unassigned", response_model=ResponseBase[EpisodeMutateRead])
async def get_or_create_unassigned_episode(
    script_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    project = await _ensure_script_project(db=db, user_id=user.id, script_id=script_id)
    
    res = await db.execute(
        select(Episode).where(
            Episode.project_id == project.id,
            Episode.episode_code == UNASSIGNED_EPISODE_CODE,
        )
    )
    unassigned = res.scalars().first()
    
    if unassigned:
        return ResponseBase(code=200, msg="OK", data=EpisodeMutateRead.model_validate(unassigned))
    
    unassigned = Episode(
        project_id=project.id,
        episode_number=0,
        episode_code=UNASSIGNED_EPISODE_CODE,
        title="未分集",
        script_full_text=None,
    )
    db.add(unassigned)
    await db.commit()
    await db.refresh(unassigned)
    return ResponseBase(code=200, msg="OK", data=EpisodeMutateRead.model_validate(unassigned))
