from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import ConfigDict


class BuiltinAgentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_code: str
    name: str
    description: str | None = None
    category: str
    default_ai_model_config_id: UUID | None = None
    tools: list[str] = Field(default_factory=list)


class BuiltinAgentPromptVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    builtin_agent_id: UUID
    version: int
    system_prompt: str
    ai_model_config_id: UUID | None = None
    description: str | None = None
    is_default: bool
    created_by: UUID | None = None
    created_at: datetime
    meta: dict = Field(default_factory=dict)


class BuiltinAgentPromptVersionCreate(BaseModel):
    system_prompt: str = Field(min_length=1)
    ai_model_config_id: UUID | None = None
    description: str | None = None
    meta: dict = Field(default_factory=dict)


class BuiltinAgentPromptVersionUpdate(BaseModel):
    system_prompt: str | None = None
    ai_model_config_id: UUID | None = None
    description: str | None = None
    meta: dict | None = None


class BuiltinAgentOverrideUserVersionRequest(BaseModel):
    user_id: UUID
    version: int


class BuiltinAgentPromptDiffResponse(BaseModel):
    diff: str


class BuiltinAgentUpdate(BaseModel):
    default_ai_model_config_id: UUID | None = None
