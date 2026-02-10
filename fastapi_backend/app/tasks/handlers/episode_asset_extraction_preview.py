from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.services.ai_asset_extraction_service import ai_asset_extraction_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class EpisodeAssetExtractionPreviewHandler(BaseTaskHandler):
    task_type = "episode_asset_extraction_preview"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        episode_id = payload.get("episode_id")
        model = str(payload.get("model") or "").strip()
        prompt_template = str(payload.get("prompt_template") or "").strip()
        temperature = payload.get("temperature")
        max_tokens = payload.get("max_tokens")

        if not episode_id:
            raise ValueError("episode_id is required")
        if not model:
            raise ValueError("model is required")
        if prompt_template is None:
            prompt_template = ""

        await reporter.progress(progress=5)
        final_prompt, raw_text, world_unity, assets = await ai_asset_extraction_service.preview(
            db=db,
            user_id=task.user_id,
            episode_id=UUID(str(episode_id)),
            model=model,
            prompt_template=prompt_template,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        await reporter.progress(progress=90)
        return {
            "final_prompt": final_prompt,
            "raw_text": raw_text,
            "world_unity": world_unity.model_dump() if world_unity else None,
            "assets": [a.model_dump() for a in assets],
        }
