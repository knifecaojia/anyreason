from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


AICategory = Literal["text", "image", "video"]


class AIModelKeyInfo(BaseModel):
    id: str
    api_key: str
    concurrency_limit: int = 5
    enabled: bool = True
    note: str | None = None


class AIModelConfigRead(BaseModel):
    id: UUID
    category: AICategory
    manufacturer: str
    model: str
    base_url: str | None = None
    enabled: bool
    sort_order: int
    credits_cost: int
    has_api_key: bool
    plaintext_api_key: str | None = None
    api_keys_info: list[AIModelKeyInfo] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminAIModelConfigCreateRequest(BaseModel):
    category: AICategory
    manufacturer: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    base_url: str | None = None
    api_key: str | None = None
    plaintext_api_key: str | None = None
    api_keys_info: list[AIModelKeyInfo] | None = None
    enabled: bool = True
    sort_order: int = 0
    credits_cost: int = 0


class AdminAIModelConfigUpdateRequest(BaseModel):
    category: AICategory | None = None
    manufacturer: str | None = Field(default=None, min_length=1, max_length=64)
    model: str | None = Field(default=None, min_length=1, max_length=128)
    base_url: str | None = None
    api_key: str | None = None
    plaintext_api_key: str | None = None
    api_keys_info: list[AIModelKeyInfo] | None = None
    enabled: bool | None = None
    sort_order: int | None = None
    credits_cost: int | None = None


class AIModelBindingRead(BaseModel):
    id: UUID
    key: str
    category: AICategory
    ai_model_config_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminAIModelBindingUpsertRequest(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    category: AICategory
    ai_model_config_id: UUID | None = None


class AdminAIModelTestChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class AdminAIModelConfigTestChatRequest(BaseModel):
    messages: list[AdminAIModelTestChatMessage] = Field(min_length=1)
    session_id: UUID | None = None


class AdminAIModelConfigTestChatResponse(BaseModel):
    output_text: str
    raw: dict[str, Any]


class AdminAIModelConfigTestImageRequest(BaseModel):
    prompt: str = Field(min_length=1)
    resolution: str | None = None
    image_data_urls: list[str] | None = None
    attachment_file_node_ids: list[UUID] | None = None
    session_id: UUID | None = None
    param_json: dict[str, Any] | None = None


class AdminAIModelConfigTestVideoRequest(BaseModel):
    prompt: str = Field(min_length=1)
    duration: int | None = None
    aspect_ratio: str | None = None
    mode: str | None = None
    attachment_file_node_ids: list[UUID] | None = None
    session_id: UUID | None = None
    param_json: dict[str, Any] | None = None


class AdminAIModelConfigTestVideoResponse(BaseModel):
    url: str
    raw: dict[str, Any] | None = None
    session_id: UUID | None = None
    run_id: UUID | None = None
    output_file_node_id: UUID | None = None
    output_content_type: str | None = None
    input_file_node_ids: list[UUID] | None = None


class AdminAIModelConfigTestAsyncResponse(BaseModel):
    task_id: str
    session_id: str


class AdminAIModelConfigTestImageResponse(BaseModel):
    url: str
    raw: dict[str, Any] | None = None
    session_id: UUID | None = None
    run_id: UUID | None = None
    output_file_node_id: UUID | None = None
    output_content_type: str | None = None
    input_file_node_ids: list[UUID] | None = None


class AIModelTestImageRunRead(BaseModel):
    id: UUID
    prompt: str
    resolution: str | None = None
    input_image_count: int
    input_file_node_ids: list[UUID] = []
    output_file_node_id: UUID | None = None
    output_content_type: str | None = None
    output_url: str | None = None
    error_message: str | None = None
    raw_payload: dict[str, Any] | None = None
    created_at: datetime


class AIModelTestTextRunRead(BaseModel):
    id: UUID
    messages: list[dict[str, Any]] = []
    output_text: str | None = None
    error_message: str | None = None
    raw_payload: dict[str, Any] | None = None
    created_at: datetime


class AIModelTestVideoRunRead(BaseModel):
    id: UUID
    prompt: str
    duration: int | None = None
    aspect_ratio: str | None = None
    input_file_node_ids: list[UUID] = []
    output_file_node_id: UUID | None = None
    output_content_type: str | None = None
    output_url: str | None = None
    error_message: str | None = None
    raw_payload: dict[str, Any] | None = None
    created_at: datetime


class AIModelTestSessionRead(BaseModel):
    id: UUID
    user_id: UUID
    category: AICategory
    ai_model_config_id: UUID | None = None
    title: str
    image_attachment_node_ids: list[UUID] = []
    created_at: datetime
    updated_at: datetime
    image_runs: list[AIModelTestImageRunRead] = []
    text_runs: list[AIModelTestTextRunRead] = []
    video_runs: list[AIModelTestVideoRunRead] = []


class AdminAIModelTestSessionCreateRequest(BaseModel):
    category: AICategory
    ai_model_config_id: UUID | None = None
    title: str | None = None


class AIModelTestSessionListItem(BaseModel):
    id: UUID
    category: AICategory
    ai_model_config_id: UUID | None = None
    title: str
    created_at: datetime
    updated_at: datetime
    image_run_count: int = 0
    run_count: int = 0


class AIModelTestSessionListResponse(BaseModel):
    items: list[AIModelTestSessionListItem]
    total: int
    page: int
    page_size: int
