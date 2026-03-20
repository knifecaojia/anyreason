from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi_pagination import Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.repositories import task_repository
from app.schemas import TaskCreateRequest
from app.tasks.queue import publish_task_event
from app.tasks.queue import enqueue_task


class TaskService:
    async def create_task(self, *, db: AsyncSession, user_id: UUID, payload: TaskCreateRequest):
        task_type = (payload.type or "").strip()
        entity_type = (payload.entity_type or "").strip() or None
        task = await task_repository.create_task(
            db=db,
            user_id=user_id,
            task_data={
                "type": task_type,
                "entity_type": entity_type,
                "entity_id": payload.entity_id,
                "input_json": payload.input_json,
            },
        )
        # Normalize task column values
        task_id: UUID = task.id  # type: ignore[assignment]
        task_user_id: str = str(task.user_id)  # type: ignore[arg-type]
        task_status: str = str(task.status)  # type: ignore[arg-type]
        task_progress: int = int(task.progress or 0)  # type: ignore[arg-type]
        
        await task_repository.create_task_event(
            db=db, task_id=task_id, event_type="created", payload={"status": task_status}  # type: ignore[arg-type]
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": task_user_id,
                    "task_id": str(task_id),
                    "event_type": "created",
                    "status": task_status,
                    "progress": task_progress,
                }
            )
        )
        await enqueue_task(task_id=task_id)  # type: ignore[arg-type]
        return task

    async def get_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        return await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)

    async def list_tasks(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        params: Params,
        statuses: list[str] | None,
        entity_type: str | None,
        entity_id: UUID | None,
        task_type: str | None = None,
    ):
        return await task_repository.list_user_tasks(
            db=db,
            user_id=user_id,
            params=params,
            statuses=statuses,
            entity_type=entity_type,
            entity_id=entity_id,
            task_type=task_type,
        )

    async def list_task_events(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        task_id: UUID,
        limit: int = 200,
        offset: int = 0,
        order: str = "asc",
    ):
        return await task_repository.list_task_events(
            db=db,
            user_id=user_id,
            task_id=task_id,
            limit=limit,
            offset=offset,
            order=order,
        )

    async def cancel_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        task = await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)
        if task is None:
            return None
        
        # Normalize task column values for type-safe operations
        tid: UUID = task.id  # type: ignore[assignment]
        task_user_id: str = str(task.user_id)  # type: ignore[arg-type]
        task_status: str = str(task.status)  # type: ignore[arg-type]
        task_progress: int = int(task.progress or 0)  # type: ignore[arg-type]
        task_slot_config_id: str | None = str(task.slot_config_id) if task.slot_config_id is not None else None  # type: ignore[arg-type]
        task_slot_owner_token: str | None = str(task.slot_owner_token) if task.slot_owner_token is not None else None  # type: ignore[arg-type]
        
        if task_status in {"succeeded", "failed", "canceled"}:
            return task

        # =============================================================================
        # Queue-aware cancellation: Handle pre-slot vs post-submit cancel semantics
        # =============================================================================

        # Phase 1: Pre-slot cancel (queued_for_slot)
        # - Task is waiting in queue for slot capacity
        # - Simply remove from queue, no slot to release
        if task_status == "queued_for_slot":
            # Remove from slot queue (no slot was ever acquired)
            await self._remove_from_slot_queue(task)
            # Clear queue metadata
            task.queue_position = None  # type: ignore[assignment]
            task.queued_at = None  # type: ignore[assignment]
            # Keep slot metadata as-is (should be None for queued_for_slot anyway)

        # Phase 2: Post-submit cancel (submitting or waiting_external)
        # - Task has acquired a slot and is in the process of submitting
        # - Must release slot before canceling
        elif task_status in {"submitting", "waiting_external"}:
            # Release the slot back to the pool
            await self._release_task_slot(task)
            # Clear all slot metadata
            task.slot_owner_token = None  # type: ignore[assignment]
            task.slot_config_id = None  # type: ignore[assignment]
            task.slot_acquired_at = None  # type: ignore[assignment]
            task.queue_position = None  # type: ignore[assignment]
            task.queued_at = None  # type: ignore[assignment]

        # Phase 3: Legacy cancel (running)
        # - Non-queueable tasks that are actively running
        # - No slot handling needed
        # - Proceed with standard cancellation

        task.status = "canceled"  # type: ignore[assignment]
        task.finished_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        task.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        task = await task_repository.update_task(db=db, task=task)
        await task_repository.create_task_event(
            db=db, task_id=tid, event_type="canceled", payload={"status": "canceled"}  # type: ignore[arg-type]
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": task_user_id,
                    "task_id": str(tid),
                    "event_type": "canceled",
                    "status": "canceled",
                    "progress": task_progress,
                }
            )
        )
        return task

    async def _remove_from_slot_queue(self, task: Task) -> None:
        """Remove task from slot queue without releasing any slots."""
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager

        # Normalize task column values
        task_slot_config_id: str | None = str(task.slot_config_id) if task.slot_config_id is not None else None  # type: ignore[arg-type]
        task_slot_owner_token: str | None = str(task.slot_owner_token) if task.slot_owner_token is not None else None  # type: ignore[arg-type]
        
        if task_slot_config_id is not None and task_slot_owner_token is not None:
            manager = AIKeyConcurrencyManager()
            await manager.remove_from_queue(
                config_id=task_slot_config_id,
                owner_token=task_slot_owner_token,
            )

    async def _release_task_slot(self, task: Task) -> None:
        """Release slot held by task back to the pool."""
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager

        # Normalize task column values
        task_slot_config_id: str | None = str(task.slot_config_id) if task.slot_config_id is not None else None  # type: ignore[arg-type]
        task_slot_owner_token: str | None = str(task.slot_owner_token) if task.slot_owner_token is not None else None  # type: ignore[arg-type]
        
        if task_slot_config_id is not None and task_slot_owner_token is not None:
            manager = AIKeyConcurrencyManager()
            # Release with owner verification to prevent unauthorized release
            await manager.release_key_with_owner(
                config_id=task_slot_config_id,
                owner_token=task_slot_owner_token,
            )

    async def retry_task(self, *, db: AsyncSession, user_id: UUID, task_id: UUID):
        task = await task_repository.get_user_task(db=db, user_id=user_id, task_id=task_id)
        if task is None:
            return None
        
        # Normalize task column values
        tid: UUID = task.id  # type: ignore[assignment]
        task_user_id: str = str(task.user_id)  # type: ignore[arg-type]
        task_status: str = str(task.status)  # type: ignore[arg-type]
        task_slot_owner_token: str | None = str(task.slot_owner_token) if task.slot_owner_token is not None else None  # type: ignore[arg-type]
        
        if task_status not in {"failed", "canceled"}:
            return task

        # =============================================================================
        # Queue-aware retry: Distinguish pre-slot vs post-submit failure semantics
        # =============================================================================

        # Determine failure phase based on task metadata:
        # - If task has slot_owner_token: acquired slot (post-submit phase)
        # - If task only has queue metadata: pre-slot phase

        was_post_submit_failure = task_slot_owner_token is not None

        # Reset task to queued (will enter queue again if slot capacity is full)
        task.status = "queued"  # type: ignore[assignment]
        task.progress = 0  # type: ignore[assignment]
        task.error = None  # type: ignore[assignment]
        task.result_json = {}  # type: ignore[assignment]
        task.started_at = None  # type: ignore[assignment]
        task.finished_at = None  # type: ignore[assignment]
        task.external_task_id = None  # type: ignore[assignment]
        task.external_provider = None  # type: ignore[assignment]
        task.external_meta = {}  # type: ignore[assignment]
        task.next_poll_at = None  # type: ignore[assignment]
        task.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]

        # Clear slot metadata regardless of failure phase
        # The task will re-acquire slot if needed on next run
        task.slot_owner_token = None  # type: ignore[assignment]
        task.slot_config_id = None  # type: ignore[assignment]
        task.slot_acquired_at = None  # type: ignore[assignment]

        # Clear queue metadata (task will get new position if it queues again)
        task.queue_position = None  # type: ignore[assignment]
        task.queued_at = None  # type: ignore[assignment]

        task = await task_repository.update_task(db=db, task=task)
        await task_repository.create_task_event(
            db=db, task_id=tid, event_type="retried", payload={  # type: ignore[arg-type]
                "status": "queued",
                "was_post_submit_failure": was_post_submit_failure,
            }
        )
        asyncio.create_task(
            publish_task_event(
                payload={
                    "user_id": task_user_id,
                    "task_id": str(tid),
                    "event_type": "retried",
                    "status": "queued",
                    "progress": 0,
                }
            )
        )
        await enqueue_task(task_id=tid)  # type: ignore[arg-type]
        return task


task_service = TaskService()
