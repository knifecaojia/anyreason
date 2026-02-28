from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai_scene_test.runner import run_scene_test_chat
from app.database import engine as async_engine
from app.models import Task
from app.schemas_ai_scene_test import AISceneTestChatRequest
from app.services.ai_chat_session_service import ai_chat_session_service
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter

logger = logging.getLogger(__name__)


class AiSceneTestChatHandler(BaseTaskHandler):
    task_type = "ai_scene_test_chat"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        try:
            body = AISceneTestChatRequest.model_validate(task.input_json or {})
        except ValidationError as e:
            raise ValueError(str(e)) from e

        last_reported_progress = 0

        async def _report_progress(value: int, payload: dict[str, Any]) -> None:
            nonlocal last_reported_progress
            if value > last_reported_progress:
                await reporter.progress(progress=value, payload=payload)
                last_reported_progress = value

        await _report_progress(5, {"stage": "prepared"})

        trace_queue: asyncio.Queue = asyncio.Queue()
        output_text: str = ""
        plans: list = []
        trace_events: list[dict[str, Any]] = []
        archive: dict[str, Any] | None = None
        started_at = time.monotonic()
        last_cancel_check = started_at

        async def run_in_background():
            nonlocal output_text, plans, trace_events, archive
            bg_session_maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
            async with bg_session_maker() as bg_db:
                output_text, plans, trace_events, archive = await run_scene_test_chat(
                    body=body,
                    db=bg_db,
                    user_id=task.user_id,
                    trace_queue=trace_queue,
                    task_id=task.id,
                )

        bg = asyncio.create_task(run_in_background())

        await _report_progress(10, {"stage": "running"})

        event_count = 0

        def _sanitize_preview(preview: Any) -> Any:
            if not isinstance(preview, dict):
                return preview
            p = preview.copy()
            if "files" in p and isinstance(p["files"], list):
                new_files = []
                for f in p["files"]:
                    if isinstance(f, dict):
                        nf = f.copy()
                        # Truncate content_md to avoid huge payloads in logs/results
                        if "content_md" in nf and len(str(nf["content_md"] or "")) > 1000:
                            nf["content_md"] = str(nf["content_md"])[:1000] + "... (truncated)"
                        if "details_md" in nf and len(str(nf["details_md"] or "")) > 1000:
                            nf["details_md"] = str(nf["details_md"])[:1000] + "... (truncated)"
                        new_files.append(nf)
                    else:
                        new_files.append(f)
                p["files"] = new_files
            return p

        while True:
            if bg.done() and trace_queue.empty():
                break
            now = time.monotonic()
            if now - last_cancel_check >= 2.0:
                last_cancel_check = now
                res = await db.execute(select(Task.status).where(Task.id == task.id))
                status = res.scalar_one_or_none()
                if status == "canceled":
                    bg.cancel()
                    return {}
            try:
                evt = await asyncio.wait_for(trace_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                await asyncio.sleep(0)
                continue

            if isinstance(evt, dict):
                # Keep raw event for result, but we might need to sanitize it later if too big
                # For now, append raw event to local list
                if len(trace_events) < 200:
                    trace_events.append(evt)
                
                typ = str(evt.get("type") or "event")
                payload: dict[str, Any] = {"type": typ}
                for k in ("tool_id", "label", "agent_code", "version", "output_type", "message"):
                    if k in evt and evt.get(k) is not None:
                        payload[k] = evt.get(k)
                if "preview" in evt and evt.get("preview") is not None:
                    # Sanitize preview for real-time log to avoid WebSocket/DB bloat
                    payload["preview"] = _sanitize_preview(evt.get("preview"))
                
                await reporter.log(message="trace", level="info", payload=payload)

                # 动态进度：10% ~ 90% 之间按 event 数量递增（每个 event +5%）
                event_count += 1
                dynamic_progress = min(90, 10 + event_count * 5)
                await _report_progress(dynamic_progress, {"stage": "working"})

        try:
            await bg
        except asyncio.CancelledError:
            return {}

        await _report_progress(95, {"stage": "finalizing"})

        plans_json = []
        for p in plans or []:
            try:
                plans_json.append(p.model_dump(mode='json'))
            except Exception:
                try:
                    plans_json.append(dict(p))
                except Exception:
                    continue
        
        # Sanitize trace_events for final result
        # Also ensure JSON compatibility (e.g. UUID -> str)
        from fastapi.encoders import jsonable_encoder
        
        final_trace_events = []
        for evt in trace_events:
            new_evt = evt.copy()
            if "preview" in new_evt:
                new_evt["preview"] = _sanitize_preview(new_evt["preview"])
            final_trace_events.append(new_evt)
        
        final_trace_events = jsonable_encoder(final_trace_events)

        # Save to session if requested
        if body.session_id:
            logger.info(
                "[ai-scene-chat] saving assistant message to session=%s task=%s output_len=%d plans_count=%d",
                body.session_id, task.id, len(output_text or ""), len(plans_json),
            )
            try:
                msg = await ai_chat_session_service.add_message(
                    db=db,
                    session_id=body.session_id,
                    role="assistant",
                    content=output_text,
                    plans=plans_json,
                    trace=final_trace_events,
                )
                logger.info("[ai-scene-chat] add_message returned id=%s session=%s", msg.id, body.session_id)
                
                await ai_chat_session_service.touch_session(db=db, session_id=body.session_id)
                
                await db.commit()
                logger.info("[ai-scene-chat] committed assistant message session=%s task=%s", body.session_id, task.id)
            except Exception as e:
                logger.error(
                    "[ai-scene-chat] FAILED to save assistant message session=%s task=%s error=%s",
                    body.session_id, task.id, e,
                    exc_info=True,
                )
                # Don't re-raise — the task result is still valid even if session save fails
        else:
            logger.info("[ai-scene-chat] no session_id in request, skipping message save task=%s", task.id)

        return {
            "output_text": output_text,
            "plans": plans_json,
            "trace_events": final_trace_events,
            "archive": archive,
        }
