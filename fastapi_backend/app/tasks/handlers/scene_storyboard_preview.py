from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.services.ai_storyboard_service import ai_storyboard_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class SceneStoryboardPreviewHandler(BaseTaskHandler):
    task_type = "scene_storyboard_preview"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        scene_id = payload.get("scene_id")
        model = str(payload.get("model") or "").strip()
        prompt_template = str(payload.get("prompt_template") or "").strip()
        temperature = payload.get("temperature")
        max_tokens = payload.get("max_tokens")

        if not scene_id:
            raise ValueError("scene_id is required")
        if not model:
            raise ValueError("model is required")
        if prompt_template is None:
            prompt_template = ""

        await reporter.progress(progress=5)
        final_prompt, raw_text, shots = await ai_storyboard_service.preview(
            db=db,
            user_id=task.user_id,
            storyboard_id=UUID(str(scene_id)),
            model=model,
            prompt_template=prompt_template,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        await reporter.progress(progress=90)
        return {
            "final_prompt": final_prompt,
            "raw_text": raw_text,
            "shots": [s.model_dump() for s in shots],
        }
