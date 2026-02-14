from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_tools.apply_plan import ApplyPlan


@dataclass
class SceneTestDeps:
    db: AsyncSession
    user_id: UUID
    script_text: str
    agent_versions: dict[str, int] = field(default_factory=dict)
    plans: list[ApplyPlan] = field(default_factory=list)
    trace_events: list[dict[str, Any]] = field(default_factory=list)
    trace_queue: Any | None = None
    meta: dict[str, Any] = field(default_factory=dict)
