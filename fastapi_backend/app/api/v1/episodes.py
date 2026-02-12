from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import Episode, Project, Script
from app.schemas import EpisodeCreateRequest, EpisodeMutateRead, EpisodeUpdateRequest
from app.schemas_response import ResponseBase
from app.users import current_active_user


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

    project = await db.get(Project, script_id)
    if project:
        return project

    project = Project(id=script_id, owner_id=user_id, name=script.title)
    db.add(project)
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

