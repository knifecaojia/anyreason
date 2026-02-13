from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, UserApp
from app.services.app_runtime_service import execute_user_app_flow, validate_flow_definition
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter


class UserAppRunHandler(BaseTaskHandler):
    task_type = "user_app_run"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict:
        payload = task.input_json or {}
        raw_app_id = payload.get("app_id")
        if not raw_app_id:
            raise ValueError("app_id_required")
        app_id = UUID(str(raw_app_id))

        app = (
            await db.execute(select(UserApp).where(UserApp.id == app_id, UserApp.user_id == task.user_id))
        ).scalar_one_or_none()
        if app is None:
            raise ValueError("user_app_not_found")
        if not app.is_active:
            raise ValueError("user_app_inactive")

        flow = validate_flow_definition(app.flow_definition or {})
        _ = flow

        input_data = payload.get("input_data") or {}
        if not isinstance(input_data, dict):
            raise ValueError("input_data_must_be_object")

        result = await execute_user_app_flow(
            db=db,
            user_id=task.user_id,
            flow_definition=app.flow_definition or {},
            input_data=input_data,
            reporter=reporter,
        )
        return result
