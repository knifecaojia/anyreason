from __future__ import annotations

from pydantic import BaseModel, Field


class AdminAISceneRead(BaseModel):
    scene_code: str
    name: str
    type: str
    description: str | None = None
    builtin_agent_code: str | None = None
    required_tools: list[str] = Field(default_factory=list)
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    ui_config: dict = Field(default_factory=dict)
    effective_input_schema: dict = Field(default_factory=dict)
    effective_output_schema: dict = Field(default_factory=dict)
    is_runnable: bool = False
    created_at: str | None = None
    updated_at: str | None = None


class AdminAISceneCreateRequest(BaseModel):
    scene_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=32)
    description: str | None = None
    builtin_agent_code: str | None = None
    required_tools: list[str] = Field(default_factory=list)
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    ui_config: dict = Field(default_factory=dict)


class AdminAISceneUpdateRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    description: str | None = None
    builtin_agent_code: str | None = None
    required_tools: list[str] | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    ui_config: dict | None = None

