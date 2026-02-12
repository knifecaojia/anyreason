from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, FileNode, Project
from app.services.storage.vfs_service import vfs_service


_DELIM_RE = re.compile(r"(?m)^\s*---\s*$")


def split_markdown_objects(text: str) -> list[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    parts = [p.strip() for p in _DELIM_RE.split(raw)]
    return [p for p in parts if p]


def extract_heading(md: str) -> str:
    for line in (md or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            return s.lstrip("#").strip()
        break
    return ""


def safe_filename(value: str) -> str:
    name = (value or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r'[<>:"|?*]+', "_", name)
    name = name.strip("._-")
    return name or "untitled"


async def load_episode_authorized(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> Episode:
    res = await db.execute(select(Episode).where(Episode.id == episode_id))
    episode = res.scalars().first()
    if not episode:
        raise ValueError("Episode not found")
    if not episode.project_id:
        raise ValueError("Episode not bound to project")
    project = await db.get(Project, episode.project_id)
    if not project or project.owner_id != user_id:
        raise ValueError("Episode not found or not authorized")
    return episode


async def ensure_asset_root(*, db: AsyncSession, user_id: UUID, episode: Episode) -> UUID:
    if episode.asset_root_node_id:
        node = await db.get(FileNode, episode.asset_root_node_id)
        if node and node.is_folder:
            return node.id

    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name="资产",
        parent_id=None,
        workspace_id=None,
        project_id=episode.project_id,
    )
    episode.asset_root_node_id = created.id
    await db.commit()
    await db.refresh(episode)
    return created.id


async def list_children(*, db: AsyncSession, user_id: UUID, folder_id: UUID) -> list:
    return await vfs_service.list_nodes(db=db, user_id=user_id, parent_id=folder_id)


async def clear_folder(*, db: AsyncSession, user_id: UUID, folder_id: UUID) -> None:
    children = await list_children(db=db, user_id=user_id, folder_id=folder_id)
    for ch in children:
        await vfs_service.delete_node(db=db, user_id=user_id, node_id=ch.id, recursive=True)


async def get_or_create_folder(*, db: AsyncSession, user_id: UUID, parent_id: UUID, name: str, project_id: UUID | None) -> UUID:
    res = await db.execute(
        select(FileNode).where(
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

