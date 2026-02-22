from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.apply_plans import ApplyExecuteRequest, api_execute_apply_plan
from app.database import User
from app.models import Task
from app.tasks.handlers.base import BaseTaskHandler
from app.tasks.reporter import TaskReporter
from app.ai_tools.apply_plan import ApplyPlan


class ApplyPlanExecuteHandler(BaseTaskHandler):
    task_type = "apply_plan_execute"

    async def run(self, *, db: AsyncSession, task: Task, reporter: TaskReporter) -> dict[str, Any]:
        payload = task.input_json or {}
        plan_raw = payload.get("plan")
        confirm = bool(payload.get("confirm", True))

        if not confirm:
            raise ValueError("confirm_required")
        if not isinstance(plan_raw, dict):
            raise ValueError("plan_required")

        user = await db.get(User, task.user_id)
        if user is None:
            raise ValueError("user_not_found")

        await reporter.progress(progress=5)
        plan = ApplyPlan.model_validate(plan_raw)
        await reporter.progress(progress=15)

        resp = await api_execute_apply_plan(
            body=ApplyExecuteRequest(plan=plan, confirm=True),
            db=db,
            user=user,
        )
        await reporter.progress(progress=95)
        return resp.model_dump()

