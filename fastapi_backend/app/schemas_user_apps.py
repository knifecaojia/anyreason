from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserAppRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    workspace_id: UUID | None = None
    name: str
    description: str | None = None
    icon: str | None = None
    flow_definition: dict = Field(default_factory=dict)
    trigger_type: str
    input_template: dict = Field(default_factory=dict)
    output_template: dict = Field(default_factory=dict)
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserAppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    icon: str | None = None
    flow_definition: dict = Field(default_factory=dict)
    trigger_type: str = "manual"
    input_template: dict = Field(default_factory=dict)
    output_template: dict = Field(default_factory=dict)
    is_active: bool = True


class UserAppUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    icon: str | None = None
    flow_definition: dict | None = None
    trigger_type: str | None = None
    input_template: dict | None = None
    output_template: dict | None = None
    is_active: bool | None = None


class UserAppRunRequest(BaseModel):
    input_data: dict = Field(default_factory=dict)

