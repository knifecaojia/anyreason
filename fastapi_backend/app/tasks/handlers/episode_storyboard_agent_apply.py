from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import Episode, FileNode, Project
from app.services.agent_service import agent_service
from app.services.storage.vfs_service import vfs_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


_DELIM_RE = re.compile(r"(?m)^\s*---\s*$")


def _split_markdown_objects(text: str) -> list[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    parts = [p.strip() for p in _DELIM_RE.split(raw)]
    return [p for p in parts if p]


def _extract_title(md: str, default: str) -> str:
    for line in (md or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            return s.lstrip("#").strip() or default
        return default
    return default


def _safe_filename(value: str) -> str:
    name = (value or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r'[<>:"|?*]+', "_", name)
    name = name.strip("._-")
    return name or "untitled"


async def _ensure_storyboard_root(*, db: AsyncSession, user_id: UUID, episode: Episode) -> UUID:
    if episode.storyboard_root_node_id:
        node = await db.get(FileNode, episode.storyboard_root_node_id)
        if node and node.is_folder:
            return node.id

    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name="故事板",
        parent_id=None,
        workspace_id=None,
        project_id=episode.project_id,
    )
    episode.storyboard_root_node_id = created.id
    await db.commit()
    await db.refresh(episode)
    return created.id


async def _clear_folder(*, db: AsyncSession, user_id: UUID, folder_id: UUID) -> None:
    children = await vfs_service.list_nodes(db=db, user_id=user_id, parent_id=folder_id)
    for ch in children:
        await vfs_service.delete_node(db=db, user_id=user_id, node_id=ch.id, recursive=True)


class EpisodeStoryboardAgentApplyHandler(BaseTaskHandler):
    task_type = "episode_storyboard_agent_apply"

    async def run(self, *, db: AsyncSession, task, reporter: TaskReporter) -> dict:
        episode_id = (task.input_json or {}).get("episode_id")
        agent_id = (task.input_json or {}).get("agent_id")
        if not episode_id or not agent_id:
            raise ValueError("episode_id and agent_id are required")

        try:
            episode_uuid = UUID(str(episode_id))
            agent_uuid = UUID(str(agent_id))
        except Exception:
            raise ValueError("episode_id and agent_id must be UUID")

        res = await db.execute(select(Episode).where(Episode.id == episode_uuid))
        episode = res.scalars().first()
        if not episode:
            raise AppError(msg="Episode not found", code=404, status_code=404)
        if not episode.project_id:
            raise AppError(msg="Episode not bound to project", code=400, status_code=400)
        project = await db.get(Project, episode.project_id)
        if not project or project.owner_id != task.user_id:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

        script_text = (episode.script_full_text or "").strip()
        if not script_text:
            raise ValueError("episode script_full_text is empty")

        await reporter.progress(progress=5)
        await reporter.log(message="准备故事板输出目录", level="info", payload={"episode_id": str(episode.id)})
        root_id = await _ensure_storyboard_root(db=db, user_id=task.user_id, episode=episode)
        await _clear_folder(db=db, user_id=task.user_id, folder_id=root_id)

        await reporter.progress(progress=15)
        await reporter.log(message="开始调用故事板提取 Agent", level="info", payload={"agent_id": str(agent_uuid)})
        input_text = "\n".join(
            [
                "请基于下面的剧集剧本完成【故事板拆解】。",
                "输出要求：",
                "- 使用 Markdown",
                "- 多个对象用单独一行 `---` 分隔",
                "- 每个对象第一行必须是 `# 标题`",
                "",
                "剧集剧本：",
                script_text,
            ]
        )
        output_text, raw = await agent_service.run_dialogue_agent(
            db=db,
            user_id=task.user_id,
            agent_id=agent_uuid,
            input_text=input_text,
            variables={
                "episode_id": str(episode.id),
                "episode_code": episode.episode_code,
                "episode_number": str(episode.episode_number),
                "episode_title": episode.title or "",
                "episode_script": script_text,
            },
        )

        await reporter.progress(progress=60)
        docs = _split_markdown_objects(output_text)
        if not docs:
            raise ValueError("agent output is empty")
        await reporter.log(message="解析 Agent 输出完成", level="info", payload={"doc_count": len(docs)})

        created_ids: list[str] = []
        for idx, md in enumerate(docs, start=1):
            title = _extract_title(md, default=f"故事板_{idx:02d}")
            filename = f"{idx:03d}_{_safe_filename(title)}.md"
            node = await vfs_service.create_text_file(
                db=db,
                user_id=task.user_id,
                name=filename,
                content=md,
                parent_id=root_id,
                workspace_id=None,
                project_id=episode.project_id,
                content_type="text/markdown; charset=utf-8",
            )
            created_ids.append(str(node.id))

        await reporter.progress(progress=90)
        await reporter.log(message="故事板文档写入完成", level="info", payload={"doc_count": len(created_ids)})
        snippet = (output_text or "")[:20000]
        return {
            "episode_id": str(episode.id),
            "storyboard_root_node_id": str(root_id),
            "doc_count": len(created_ids),
            "doc_node_ids": created_ids,
            "output_text": snippet,
            "raw": raw,
        }
