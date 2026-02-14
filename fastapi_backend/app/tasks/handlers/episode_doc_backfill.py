from __future__ import annotations

import importlib.resources
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import Episode, FileNode, Project
from app.services.storage.vfs_service import vfs_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter
from app.vfs_layout import EPISODES_FOLDER_NAME, episode_filename


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


def _render_episode_doc(*, ep: Episode, source: str) -> str:
    title = (ep.title or "").strip()
    safe_title = title.replace("\n", " ").strip()
    body = (ep.script_full_text or "").strip("\n")
    tpl = _get_episode_doc_template()
    out = tpl
    out = out.replace("{{episode_number}}", str(int(ep.episode_number)))
    out = out.replace("{{episode_number_padded}}", f"{int(ep.episode_number):03d}")
    out = out.replace("{{episode_code}}", ep.episode_code)
    out = out.replace("{{title}}", safe_title)
    out = out.replace("{{source}}", source)
    out = out.replace("{{body}}", body)
    return out.rstrip() + "\n"


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


class EpisodeDocBackfillHandler(BaseTaskHandler):
    task_type = "episode_doc_backfill"

    async def run(self, *, db: AsyncSession, task, reporter: TaskReporter) -> dict:
        project_id_raw = (task.input_json or {}).get("project_id")
        if not project_id_raw:
            raise ValueError("project_id is required")
        try:
            project_id = UUID(str(project_id_raw))
        except Exception:
            raise ValueError("project_id must be UUID")

        project = await db.get(Project, project_id)
        if project is None or project.owner_id != task.user_id:
            raise AppError(msg="Project not found or not authorized", code=404, status_code=404)

        res = await db.execute(
            select(Episode).where(
                Episode.project_id == project_id,
            ).order_by(Episode.episode_number.asc())
        )
        episodes = list(res.scalars().all())
        if not episodes:
            return {"project_id": str(project_id), "total": 0, "created": 0, "skipped": 0}

        episodes_root_id = await _get_or_create_project_root_folder(
            db=db,
            user_id=task.user_id,
            project_id=project_id,
            name=EPISODES_FOLDER_NAME,
        )

        created = 0
        skipped = 0
        failures: list[dict] = []
        total = len(episodes)
        for idx, ep in enumerate(episodes):
            try:
                if ep.episode_doc_node_id:
                    skipped += 1
                else:
                    filename = episode_filename(episode_number=ep.episode_number, title=ep.title)
                    content_md = _render_episode_doc(ep=ep, source="backfill/db/script_full_text")
                    node = await vfs_service.upsert_text_file(
                        db=db,
                        user_id=task.user_id,
                        name=filename,
                        content=content_md,
                        parent_id=episodes_root_id,
                        workspace_id=None,
                        project_id=project_id,
                        content_type="text/markdown; charset=utf-8",
                    )
                    ep.episode_doc_node_id = node.id
                    ep.word_count = _count_non_whitespace_chars(content_md)
                    await db.commit()
                    created += 1
            except Exception as e:
                await db.rollback()
                failures.append({"episode_id": str(ep.id), "episode_number": int(ep.episode_number), "error": str(e)})

            progress = int(((idx + 1) / total) * 100)
            await reporter.progress(progress=progress, payload={"created": created, "skipped": skipped, "failed": len(failures)})

        result = {
            "project_id": str(project_id),
            "total": total,
            "created": created,
            "skipped": skipped,
            "failed": len(failures),
            "failures": failures[:50],
        }
        return result
