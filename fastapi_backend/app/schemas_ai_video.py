from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AIVideoGenerateRequest(BaseModel):
    binding_key: str | None = Field(default="video", max_length=64)
    model_config_id: UUID | None = None
    prompt: str = Field(min_length=1)
    duration: int = Field(default=5, ge=1, le=60)
    aspect_ratio: str = Field(default="16:9")
    images: list[str] = Field(default_factory=list)


class AIVideoGenerateResponse(BaseModel):
    url: str
    raw: dict[str, Any] = Field(default_factory=dict)

