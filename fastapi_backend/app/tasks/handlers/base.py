from __future__ import annotations

from dataclasses import dataclass, field
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.schemas_media import MediaResponse
from app.tasks.reporter import TaskReporter


logger = logging.getLogger(__name__)


@dataclass
class ExternalSubmitResult:
    external_task_id: str
    provider: str
    meta: dict[str, Any] = field(default_factory=dict)


class BaseTaskHandler:
    task_type: str

    def get_slot_config_id(self, task: Task) -> str | None:
        """Resolve model config id for queue-aware two-phase tasks.

        Supports both:
        - input_json["model_config_id"]
        - input_json["config"]["model_config_id"]
        """
        payload = task.input_json or {}
        if not isinstance(payload, dict):
            logger.warning(
                "[task-handler] slot config resolution task=%s type=%s payload_type=%s resolved=None",
                getattr(task, "id", None),
                getattr(task, "type", None),
                type(payload).__name__,
            )
            return None

        model_config_id = payload.get("model_config_id")
        if model_config_id:
            resolved = str(model_config_id)
            logger.info(
                "[task-handler] slot config resolution task=%s type=%s source=top-level resolved=%s",
                getattr(task, "id", None),
                getattr(task, "type", None),
                resolved,
            )
            return resolved

        config = payload.get("config")
        if isinstance(config, dict):
            nested_model_config_id = config.get("model_config_id")
            if nested_model_config_id:
                resolved = str(nested_model_config_id)
                logger.info(
                    "[task-handler] slot config resolution task=%s type=%s source=nested-config resolved=%s config=%s",
                    getattr(task, "id", None),
                    getattr(task, "type", None),
                    resolved,
                    config,
                )
                return resolved

        logger.warning(
            "[task-handler] slot config resolution task=%s type=%s source=missing resolved=None payload=%s",
            getattr(task, "id", None),
            getattr(task, "type", None),
            payload,
        )

        return None

    def get_slot_keys_info(self, task: Task) -> list[dict[str, Any]] | None:
        """Optional key metadata for queue-aware slot acquisition."""
        _ = task
        return None

    def get_slot_default_key(self, task: Task) -> str | None:
        """Optional default API key for queue-aware slot acquisition."""
        _ = task
        return None

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

    async def on_fail(self, *, db: AsyncSession, task: Task, error: str) -> None:
        """Called when the task fails. Override to perform cleanup (e.g., reset asset status)."""
        pass
