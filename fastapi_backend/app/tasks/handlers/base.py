from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.schemas_media import MediaResponse
from app.tasks.reporter import TaskReporter


@dataclass
class ExternalSubmitResult:
    external_task_id: str
    provider: str
    meta: dict[str, Any] = field(default_factory=dict)


class BaseTaskHandler:
    task_type: str

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        raise NotImplementedError()

    @property
    def supports_two_phase(self) -> bool:
        """Return True if this handler supports submit() + on_external_complete()."""
        return False

    async def submit(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> ExternalSubmitResult:
        """Phase 1: Submit work to an external provider and return immediately.
        Override in subclass and set supports_two_phase=True to enable."""
        raise NotImplementedError()

    async def on_external_complete(
        self, *, db: AsyncSession, task: Task, reporter: TaskReporter, media_response: MediaResponse,
    ) -> dict[str, Any]:
        """Phase 2: Called by the ExternalPoller when the external task succeeds.
        Receives the MediaResponse from the provider and should do post-processing
        (download, save to VFS, create records, etc.) then return result_json."""
        raise NotImplementedError()
