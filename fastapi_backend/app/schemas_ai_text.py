from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class AITextChatAttachment(BaseModel):
    kind: Literal["image", "text"]
    name: str | None = None
    content_type: str | None = None
    data_url: str | None = None
    text: str | None = None


class AITextChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class AITextChatRequest(BaseModel):
    binding_key: str | None = Field(default="chatbox", max_length=64)
    model_config_id: UUID | None = None
    messages: list[AITextChatMessage] = Field(default_factory=list)
    attachments: list[AITextChatAttachment] = Field(default_factory=list)


class AITextChatResponse(BaseModel):
    output_text: str
    raw: dict[str, Any]

