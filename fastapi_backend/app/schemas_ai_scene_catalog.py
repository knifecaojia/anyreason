from __future__ import annotations

from pydantic import BaseModel, Field


class AISceneCatalogItem(BaseModel):
    scene_code: str
    name: str
    type: str
    description: str | None = None
    builtin_agent_code: str | None = None
    required_tools: list[str] = Field(default_factory=list)
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    ui_config: dict = Field(default_factory=dict)

