from __future__ import annotations

from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


ApplyPlanKind = Literal["episode_save", "asset_create", "asset_bind", "asset_doc_upsert"]


class ApplyPlan(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    kind: ApplyPlanKind
    tool_id: str
    inputs: dict[str, Any]
    preview: dict[str, Any] = Field(default_factory=dict)
