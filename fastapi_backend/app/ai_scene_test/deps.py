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
    project_id: UUID | None = None
    context_exclude_types: set[str] = field(default_factory=set)
    context_snapshot_md: str | None = None
    context_refs: list[str] = field(default_factory=list)
    agent_versions: dict[str, int] = field(default_factory=dict)
    plans: list[ApplyPlan] = field(default_factory=list)
    trace_events: list[dict[str, Any]] = field(default_factory=list)
    trace_queue: Any | None = None
    meta: dict[str, Any] = field(default_factory=dict)
    run_id: str | None = None
    debug_log_path: str | None = None
