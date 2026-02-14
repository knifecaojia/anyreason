from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FileNode, Project
from app.services.storage.vfs_service import vfs_service
from app.vfs_layout import ASSETS_FOLDER_NAME, ASSET_TYPE_FOLDER_NAMES


@dataclass(frozen=True)
class ContextPreview:
    project_id: UUID
    assets_root_node_id: UUID | None
    counts: dict[str, int]
    samples: dict[str, list[dict[str, Any]]]
    refs: list[str]


@dataclass(frozen=True)
class ContextBundle:
    project_id: UUID
    context_md: str
    refs: list[str]


async def _get_assets_root_node_id(*, db: AsyncSession, project_id: UUID) -> UUID | None:
    res = await db.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id.is_(None),
            FileNode.is_folder.is_(True),
            FileNode.name == ASSETS_FOLDER_NAME,
        )
    )
    node = res.scalars().first()
    return node.id if node else None


async def build_project_asset_context_preview(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    exclude_types: set[str] | None = None,
    sample_limit: int = 10,
) -> ContextPreview:
    project = await db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        return ContextPreview(project_id=project_id, assets_root_node_id=None, counts={}, samples={}, refs=[])

    exclude_types = exclude_types or set()
    assets_root = await _get_assets_root_node_id(db=db, project_id=project_id)
    if assets_root is None:
        return ContextPreview(project_id=project_id, assets_root_node_id=None, counts={}, samples={}, refs=[])

    counts: dict[str, int] = {}
    samples: dict[str, list[dict[str, Any]]] = {}
    refs: list[str] = []

    children = await vfs_service.list_nodes(db=db, user_id=user_id, parent_id=assets_root, project_id=project_id)
    folder_by_name = {n.name: n for n in children if n.is_folder}

    for asset_type, folder_name in ASSET_TYPE_FOLDER_NAMES.items():
        if asset_type in exclude_types:
            continue
        folder = folder_by_name.get(folder_name)
        if folder is None:
            counts[asset_type] = 0
            samples[asset_type] = []
            continue
        items = await vfs_service.list_nodes(db=db, user_id=user_id, parent_id=folder.id, project_id=project_id)
        md_files = [n for n in items if not n.is_folder and (n.name or "").lower().endswith(".md")]
        counts[asset_type] = len(md_files)
        sample_items = []
        for n in md_files[: max(0, int(sample_limit))]:
            refs.append(str(n.id))
            sample_items.append({"node_id": str(n.id), "name": n.name})
        samples[asset_type] = sample_items

    return ContextPreview(project_id=project_id, assets_root_node_id=assets_root, counts=counts, samples=samples, refs=refs)


async def build_project_asset_context_bundle(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    exclude_types: set[str] | None = None,
    max_chars: int = 80_000,
) -> ContextBundle:
    preview = await build_project_asset_context_preview(
        db=db,
        user_id=user_id,
        project_id=project_id,
        exclude_types=exclude_types,
        sample_limit=10_000,
    )
    if not preview.assets_root_node_id:
        return ContextBundle(project_id=project_id, context_md="# Context\n\n(无资产库)\n", refs=[])

    refs: list[str] = []
    blocks: list[str] = ["# Context", "", "## Assets", ""]
    used = sum(len(x) + 1 for x in blocks)

    for asset_type in sorted(preview.counts.keys()):
        blocks.append(f"### {asset_type} ({preview.counts[asset_type]})")
        blocks.append("")
        for item in preview.samples.get(asset_type, []):
            node_id = item.get("node_id")
            if not node_id:
                continue
            try:
                node_uuid = UUID(str(node_id))
            except Exception:
                continue
            node, data = await vfs_service.read_file_bytes(db=db, user_id=user_id, node_id=node_uuid)
            text = data.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            header = f"#### {node.name} ({node.id})"
            snippet = f"{header}\n\n{text}\n"
            if used + len(snippet) > int(max_chars):
                blocks.append("...(truncated)")
                return ContextBundle(project_id=project_id, context_md="\n".join(blocks).rstrip() + "\n", refs=refs)
            refs.append(str(node.id))
            blocks.append(snippet.rstrip())
            blocks.append("")
            used += len(snippet) + 2

    return ContextBundle(project_id=project_id, context_md="\n".join(blocks).rstrip() + "\n", refs=refs)

