from __future__ import annotations

import asyncio
import time
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai_scene_test.runner import run_scene_test_chat
from app.database import engine as async_engine
from app.models import Task
from app.schemas_ai_scene_test import AISceneTestChatRequest
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class AiSceneTestChatHandler(BaseTaskHandler):
    task_type = "ai_scene_test_chat"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        try:
            body = AISceneTestChatRequest.model_validate(task.input_json or {})
        except ValidationError as e:
            raise ValueError(str(e)) from e

        await reporter.progress(progress=5, payload={"stage": "prepared"})

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
                )

        bg = asyncio.create_task(run_in_background())

        await reporter.progress(progress=10, payload={"stage": "running"})

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
                if len(trace_events) < 200:
                    trace_events.append(evt)
                typ = str(evt.get("type") or "event")
                payload: dict[str, Any] = {"type": typ}
                for k in ("tool_id", "label", "agent_code", "version", "output_type", "message"):
                    if k in evt and evt.get(k) is not None:
                        payload[k] = evt.get(k)
                if "preview" in evt and evt.get("preview") is not None:
                    payload["preview"] = evt.get("preview")
                await reporter.log(message="trace", level="info", payload=payload)
                if typ in {"tool_start", "agent_run_start"}:
                    await reporter.progress(progress=35, payload={"stage": "working"})
                if typ in {"tool_done", "agent_run_done"}:
                    await reporter.progress(progress=70, payload={"stage": "working"})

        try:
            await bg
        except asyncio.CancelledError:
            return {}

        await reporter.progress(progress=95, payload={"stage": "finalizing"})

        plans_json = []
        for p in plans or []:
            try:
                plans_json.append(p.model_dump())
            except Exception:
                try:
                    plans_json.append(dict(p))
                except Exception:
                    continue

        return {
            "output_text": output_text,
            "plans": plans_json,
            "trace_events": trace_events,
            "archive": archive,
        }
