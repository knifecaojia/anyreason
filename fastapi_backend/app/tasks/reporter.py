from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.repositories import task_repository
from app.tasks.queue import publish_task_event


class TaskReporter:
    def __init__(self, *, db: AsyncSession, task: Task):
        self._db = db
        self._task = task

    @property
    def task(self) -> Task:
        return self._task

    async def set_running(self) -> None:
        now = datetime.now(timezone.utc)
        # Extract plain values from ORM columns for type-safe operations
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        progress = int(self._task.progress or 0)  # type: ignore[arg-type]

        self._task.status = "running"  # type: ignore[assignment]
        self._task.started_at = self._task.started_at or now  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]  # type: ignore[arg-type]
            event_type="running",
            payload={"status": "running", "progress": progress},
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "running",
                    "status": "running",
                    "progress": progress,
                }
            )
        )

    async def progress(self, *, progress: int, payload: dict[str, Any] | None = None) -> None:
        now = datetime.now(timezone.utc)
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        current_status = str(self._task.status)  # type: ignore[arg-type]
        current_progress = int(self._task.progress or 0)  # type: ignore[arg-type]

        self._task.progress = max(0, min(100, int(progress)))  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        data = {"status": current_status, "progress": current_progress}
        if payload:
            data.update(jsonable_encoder(payload))
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="progress",
            payload=jsonable_encoder(data),
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "progress",
                    "status": current_status,
                    "progress": current_progress,
                    "payload": jsonable_encoder(payload or {}),
                }
            )
        )

    async def succeed(self, *, result_json: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc)
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]

        self._task.status = "succeeded"  # type: ignore[assignment]
        self._task.progress = 100  # type: ignore[assignment]
        self._task.result_json = jsonable_encoder(result_json or {})  # type: ignore[assignment]
        self._task.error = None  # type: ignore[assignment]
        self._task.finished_at = now  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="succeeded",
            payload={"status": "succeeded", "progress": 100},
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "succeeded",
                    "status": "succeeded",
                    "progress": 100,
                    "result_json": jsonable_encoder(result_json or {}),
                }
            )
        )

    async def log(self, *, message: str, level: str = "info", payload: dict[str, Any] | None = None) -> None:
        now = datetime.now(timezone.utc)
        msg = (message or "").strip()
        if not msg:
            return
        data: dict[str, Any] = {"level": (level or "info").strip() or "info", "message": msg}
        if payload:
            data["payload"] = jsonable_encoder(payload)
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        current_status = str(self._task.status)  # type: ignore[arg-type]
        current_progress = int(self._task.progress or 0)  # type: ignore[arg-type]

        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="log",
            payload=jsonable_encoder(data),
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "log",
                    "status": current_status,
                    "progress": current_progress,
                    "payload": jsonable_encoder(data),
                }
            )
        )

    async def publish_event(self, *, event_type: str, payload: dict[str, Any] | None = None) -> None:
        """Publish a custom event (e.g. waiting_external) to both DB and WebSocket."""
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        current_status = str(self._task.status)  # type: ignore[arg-type]
        current_progress = int(self._task.progress or 0)  # type: ignore[arg-type]

        data: dict[str, Any] = {"status": current_status, "progress": current_progress}
        if payload:
            data.update(jsonable_encoder(payload))
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type=event_type,
            payload=jsonable_encoder(data),
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": event_type,
                    "status": current_status,
                    "progress": current_progress,
                    "payload": jsonable_encoder(data),
                }
            )
        )

    async def fail(self, *, error: str, details: dict[str, Any] | None = None) -> None:
        now = datetime.now(timezone.utc)
        error_msg = (error or "").strip() or "Task failed"
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]

        self._task.status = "failed"  # type: ignore[assignment]
        self._task.error = error_msg  # type: ignore[assignment]
        self._task.finished_at = now  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        data: dict[str, Any] = {"status": "failed", "error": error_msg}
        if details:
            data["details"] = jsonable_encoder(details)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="failed",
            payload=jsonable_encoder(data),
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "failed",
                    "status": "failed",
                    "error": error_msg,
                    "payload": {"details": jsonable_encoder(details)} if details else {},
                }
            )
        )

    # ============================================================================
    # Queue-aware state transitions for video slot queue lifecycle
    # ============================================================================

    async def set_queued_for_slot(
        self,
        *,
        queue_position: int,
        slot_config_id: str | UUID | None = None,
        slot_owner_token: str | None = None,
    ) -> None:
        """Transition task to queued_for_slot state when waiting for slot capacity."""
        now = datetime.now(timezone.utc)
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        current_progress = int(self._task.progress or 0)  # type: ignore[arg-type]
        current_started_at = self._task.started_at  # type: ignore[assignment]

        self._task.status = "queued_for_slot"  # type: ignore[assignment]
        self._task.queue_position = queue_position  # type: ignore[assignment]
        self._task.queued_at = now  # type: ignore[assignment]
        self._task.started_at = current_started_at or now  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        # Pre-slot owner metadata (may be set later on dequeue)
        if slot_owner_token:
            self._task.slot_owner_token = slot_owner_token  # type: ignore[assignment]
        if slot_config_id:
            self._task.slot_config_id = slot_config_id  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="queued_for_slot",
            payload={
                "status": "queued_for_slot",
                "queue_position": queue_position,
                "queued_at": now.isoformat(),
                "slot_config_id": str(slot_config_id) if slot_config_id else None,
            },
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "queued_for_slot",
                    "status": "queued_for_slot",
                    "queue_position": queue_position,
                    "progress": current_progress,
                }
            )
        )

    async def set_submitting(
        self,
        *,
        slot_owner_token: str,
        slot_config_id: str | UUID,
        slot_acquired_at: datetime | None = None,
    ) -> None:
        """Transition task to submitting state when slot is acquired and provider handoff begins."""
        now = datetime.now(timezone.utc)
        # Extract plain values from ORM columns
        task_id = self._task.id  # type: ignore[assignment]
        user_id = str(self._task.user_id)  # type: ignore[arg-type]
        current_progress = int(self._task.progress or 0)  # type: ignore[arg-type]

        self._task.status = "submitting"  # type: ignore[assignment]
        self._task.queue_position = None  # type: ignore[assignment]
        self._task.queued_at = None  # type: ignore[assignment]
        self._task.slot_owner_token = slot_owner_token  # type: ignore[assignment]
        self._task.slot_config_id = slot_config_id  # type: ignore[assignment]
        self._task.slot_acquired_at = slot_acquired_at or now  # type: ignore[assignment]
        self._task.updated_at = now  # type: ignore[assignment]
        self._task = await task_repository.update_task(db=self._db, task=self._task)
        await task_repository.create_task_event(
            db=self._db,
            task_id=task_id,  # type: ignore[arg-type]
            event_type="submitting",
            payload={
                "status": "submitting",
                "slot_owner_token": slot_owner_token,
                "slot_config_id": str(slot_config_id),
                "slot_acquired_at": (slot_acquired_at or now).isoformat(),
            },
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": user_id,
                    "task_id": str(task_id),
                    "event_type": "submitting",
                    "status": "submitting",
                    "progress": current_progress,
                }
            )
        )

    async def clear_queue_metadata(self) -> None:
        """Clear queue metadata when task leaves queued state (success, failure, or cancellation)."""
        self._task.queue_position = None  # type: ignore[assignment]
        self._task.queued_at = None  # type: ignore[assignment]
        # Keep slot metadata for tasks that acquired a slot but failed during/after submit
        # Only clear slot metadata if explicitly requested (for failed pre-slot tasks)

    async def clear_slot_metadata(self) -> None:
        """Clear slot ownership metadata when task completes or slot is released."""
        self._task.slot_owner_token = None  # type: ignore[assignment]
        self._task.slot_config_id = None  # type: ignore[assignment]
        self._task.slot_acquired_at = None  # type: ignore[assignment]
        self._task.queue_position = None  # type: ignore[assignment]
        self._task.queued_at = None  # type: ignore[assignment]
