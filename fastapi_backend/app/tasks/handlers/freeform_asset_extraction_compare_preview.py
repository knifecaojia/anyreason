from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.services.ai_asset_extraction_service import ai_asset_extraction_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class FreeformAssetExtractionComparePreviewHandler(BaseTaskHandler):
    task_type = "freeform_asset_extraction_compare_preview"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        script_text = str(payload.get("script_text") or "").strip()
        a = payload.get("config_a") or {}
        b = payload.get("config_b") or {}

        model_a = str((a or {}).get("model") or "").strip()
        prompt_a = str((a or {}).get("prompt_template") or "").strip()
        model_b = str((b or {}).get("model") or "").strip()
        prompt_b = str((b or {}).get("prompt_template") or "").strip()
        temperature = payload.get("temperature")
        max_tokens = payload.get("max_tokens")

        if not script_text:
            raise ValueError("script_text is required")
        if not model_a or not model_b:
            raise ValueError("model is required")

        await reporter.progress(progress=5)
        final_prompt_a, raw_text_a, world_unity_a, assets_a = await ai_asset_extraction_service.preview_from_text(
            db=db,
            user_id=task.user_id,
            script_text=script_text,
            model=model_a,
            prompt_template=prompt_a,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        await reporter.progress(progress=50)
        final_prompt_b, raw_text_b, world_unity_b, assets_b = await ai_asset_extraction_service.preview_from_text(
            db=db,
            user_id=task.user_id,
            script_text=script_text,
            model=model_b,
            prompt_template=prompt_b,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        await reporter.progress(progress=90)

        return {
            "variant_a": {
                "final_prompt": final_prompt_a,
                "raw_text": raw_text_a,
                "world_unity": world_unity_a.model_dump() if world_unity_a else None,
                "assets": [a.model_dump() for a in assets_a],
            },
            "variant_b": {
                "final_prompt": final_prompt_b,
                "raw_text": raw_text_b,
                "world_unity": world_unity_b.model_dump() if world_unity_b else None,
                "assets": [a.model_dump() for a in assets_b],
            },
        }

