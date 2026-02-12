from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AIImageGenerateRequest(BaseModel):
    binding_key: str | None = Field(default="image", max_length=64)
    model_config_id: UUID | None = None
    prompt: str = Field(min_length=1)
    resolution: str | None = None
    images: list[str] = Field(default_factory=list)


class AIImageGenerateResponse(BaseModel):
    url: str
    raw: dict[str, Any] = Field(default_factory=dict)

