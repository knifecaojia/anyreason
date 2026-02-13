from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserAgentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    workspace_id: UUID | None = None
    agent_code: str | None = None
    name: str
    description: str | None = None
    base_builtin_agent_id: UUID | None = None
    system_prompt: str
    ai_model_config_id: UUID | None = None
    temperature: float | None = None
    tools: list[str] = Field(default_factory=list)
    is_public: bool
    created_at: datetime
    updated_at: datetime


class UserAgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    base_builtin_agent_id: UUID | None = None
    system_prompt: str = Field(min_length=1)
    ai_model_config_id: UUID | None = None
    temperature: float | None = None
    tools: list[str] = Field(default_factory=list)
    is_public: bool = False


class UserAgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    base_builtin_agent_id: UUID | None = None
    system_prompt: str | None = Field(default=None, min_length=1)
    ai_model_config_id: UUID | None = None
    temperature: float | None = None
    tools: list[str] | None = None
    is_public: bool | None = None

