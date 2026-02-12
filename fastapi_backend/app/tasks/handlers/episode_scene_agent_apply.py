from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, Project
from app.services.agent_service import agent_service
from app.services.storage.vfs_service import vfs_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.handlers.episode_asset_apply_utils import (
    clear_folder,
    ensure_asset_root,
    extract_heading,
    get_or_create_folder,
    safe_filename,
    split_markdown_objects,
)
from app.tasks.reporter import TaskReporter


class EpisodeSceneAgentApplyHandler(BaseTaskHandler):
    task_type = "episode_scene_agent_apply"

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
            raise ValueError("Episode not found")
        if not episode.project_id:
            raise ValueError("Episode not bound to project")
        project = await db.get(Project, episode.project_id)
        if not project or project.owner_id != task.user_id:
            raise ValueError("Episode not found or not authorized")

        script_text = (episode.script_full_text or "").strip()
        if not script_text:
            raise ValueError("episode script_full_text is empty")

        await reporter.progress(progress=5)
        await reporter.log(message="准备场景输出目录", level="info", payload={"episode_id": str(episode.id)})
        root_id = await ensure_asset_root(db=db, user_id=task.user_id, episode=episode)
        folder_id = await get_or_create_folder(
            db=db,
            user_id=task.user_id,
            parent_id=root_id,
            name="场景",
            project_id=episode.project_id,
        )
        await clear_folder(db=db, user_id=task.user_id, folder_id=folder_id)

        await reporter.progress(progress=15)
        await reporter.log(message="开始调用场景提取 Agent", level="info", payload={"agent_id": str(agent_uuid)})
        input_text = "\n".join(
            [
                "请基于下面的剧集剧本完成【场景提取】。",
                "输出要求：",
                "- 使用 Markdown",
                "- 多个对象用单独一行 `---` 分隔",
                "- 每个对象第一行必须是 `# 场景名`",
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
        docs = split_markdown_objects(output_text)
        if not docs:
            raise ValueError("agent output is empty")
        await reporter.log(message="解析 Agent 输出完成", level="info", payload={"doc_count": len(docs)})

        created_ids: list[str] = []
        for idx, md in enumerate(docs, start=1):
            title = extract_heading(md) or f"场景_{idx:02d}"
            filename = f"{idx:03d}_{safe_filename(title)}.md"
            node = await vfs_service.create_text_file(
                db=db,
                user_id=task.user_id,
                name=filename,
                content=md,
                parent_id=folder_id,
                workspace_id=None,
                project_id=episode.project_id,
                content_type="text/markdown; charset=utf-8",
            )
            created_ids.append(str(node.id))

        await reporter.progress(progress=90)
        await reporter.log(message="场景文档写入完成", level="info", payload={"doc_count": len(created_ids)})
        snippet = (output_text or "")[:20000]
        return {
            "episode_id": str(episode.id),
            "asset_root_node_id": str(root_id),
            "folder_node_id": str(folder_id),
            "doc_count": len(created_ids),
            "doc_node_ids": created_ids,
            "output_text": snippet,
            "raw": raw,
        }
