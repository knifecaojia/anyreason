from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AgentRead(BaseModel):
    id: UUID
    name: str
    category: str
    purpose: str
    ai_model_config_id: UUID
    capabilities: list[str] = Field(default_factory=list)
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    credits_per_call: int
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class AgentListRead(BaseModel):
    id: UUID
    name: str
    category: str
    purpose: str
    capabilities: list[str] = Field(default_factory=list)
    credits_per_call: int
    enabled: bool

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class AgentCreateRequest(BaseModel):
    name: str
    category: str
    purpose: str = "general"
    ai_model_config_id: UUID
    capabilities: list[str] | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    credits_per_call: int = 0
    enabled: bool = True

    model_config = {"protected_namespaces": ()}


class AgentUpdateRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    purpose: str | None = None
    ai_model_config_id: UUID | None = None
    capabilities: list[str] | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    credits_per_call: int | None = None
    enabled: bool | None = None

    model_config = {"protected_namespaces": ()}


class AgentRunRequest(BaseModel):
    input_text: str = ""
    variables: dict[str, Any] | None = None

    model_config = {"protected_namespaces": ()}


class AgentRunResponse(BaseModel):
    output_text: str
    raw: dict[str, Any] = Field(default_factory=dict)

    model_config = {"protected_namespaces": ()}


class AgentPromptVersionRead(BaseModel):
    id: UUID
    agent_id: UUID
    version: int
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    description: str | None = None
    is_default: bool
    created_by: UUID | None = None
    created_at: datetime
    meta: dict = Field(default_factory=dict)

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class AgentPromptVersionCreate(BaseModel):
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    description: str | None = None
    meta: dict = Field(default_factory=dict)

    model_config = {"protected_namespaces": ()}


class AgentPromptVersionUpdate(BaseModel):
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    description: str | None = None
    meta: dict | None = None

    model_config = {"protected_namespaces": ()}


class AgentPromptDiffResponse(BaseModel):
    diff: str

    model_config = {"protected_namespaces": ()}
