from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


AICategory = Literal["text", "image", "video"]


class AIModelConfigRead(BaseModel):
    id: UUID
    category: AICategory
    manufacturer: str
    model: str
    base_url: str | None = None
    enabled: bool
    sort_order: int
    has_api_key: bool
    created_at: datetime
    updated_at: datetime


class AdminAIModelConfigCreateRequest(BaseModel):
    category: AICategory
    manufacturer: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    base_url: str | None = None
    api_key: str | None = None
    enabled: bool = True
    sort_order: int = 0


class AdminAIModelConfigUpdateRequest(BaseModel):
    category: AICategory | None = None
    manufacturer: str | None = Field(default=None, min_length=1, max_length=64)
    model: str | None = Field(default=None, min_length=1, max_length=128)
    base_url: str | None = None
    api_key: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None


class AIModelBindingRead(BaseModel):
    id: UUID
    key: str
    category: AICategory
    ai_model_config_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class AdminAIModelBindingUpsertRequest(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    category: AICategory
    ai_model_config_id: UUID | None = None


class AdminAIModelTestChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class AdminAIModelConfigTestChatRequest(BaseModel):
    messages: list[AdminAIModelTestChatMessage] = Field(min_length=1)


class AdminAIModelConfigTestChatResponse(BaseModel):
    output_text: str
    raw: dict[str, Any]
