from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_tools.apply_plan import ApplyPlan


@dataclass
class SceneTestDeps:
    db: AsyncSession
    user_id: UUID
    script_text: str | None
    project_id: UUID | None = None
    context_exclude_types: set[str] = field(default_factory=set)
    agent_versions: dict[str, int] = field(default_factory=dict)
    trace_queue: asyncio.Queue | None = None
    plans: list[ApplyPlan] = field(default_factory=list)
    trace_events: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    run_id: str | None = None
    debug_log_path: str | None = None
    episode_ids: list[UUID] | None = None
