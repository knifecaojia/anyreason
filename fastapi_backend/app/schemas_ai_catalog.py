from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AIManufacturerBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=64, description="厂商标识，如 openai, deepseek")
    name: str = Field(..., min_length=1, max_length=128, description="显示名称，如 OpenAI, DeepSeek")
    category: str = Field(..., pattern="^(text|image|video)$", description="类别")
    provider_class: str | None = Field(None, max_length=128, description="Provider 类名")
    default_base_url: str | None = Field(None, description="默认 API Base URL")
    logo_url: str | None = Field(None, description="厂商 Logo URL")
    description: str | None = Field(None, description="描述")
    enabled: bool = Field(True, description="是否启用")
    sort_order: int = Field(0, ge=0, description="排序")


class AIManufacturerCreate(AIManufacturerBase):
    pass


class AIManufacturerUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=64)
    name: str | None = Field(None, min_length=1, max_length=128)
    category: str | None = Field(None, pattern="^(text|image|video)$")
    provider_class: str | None = Field(None, max_length=128)
    default_base_url: str | None = None
    logo_url: str | None = None
    description: str | None = None
    enabled: bool | None = None
    sort_order: int | None = Field(None, ge=0)


class AIManufacturerRead(BaseModel):
    id: UUID
    code: str
    name: str
    category: str
    provider_class: str | None
    default_base_url: str | None
    logo_url: str | None
    description: str | None
    enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIModelBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=128, description="模型标识，如 gpt-4o, deepseek-chat")
    name: str = Field(..., min_length=1, max_length=128, description="显示名称")
    response_format: str = Field("schema", pattern="^(schema|object)$", description="响应格式")
    model_capabilities: dict[str, Any] = Field(default_factory=dict, description="模型能力描述")
    category: str | None = Field(None, pattern="^(text|image|video)$", description="模型类别")
    supports_image: bool = Field(False, description="是否支持图像")
    supports_think: bool = Field(False, description="是否支持思考链")
    supports_tool: bool = Field(True, description="是否支持工具调用")
    context_window: int | None = Field(None, ge=0, description="上下文窗口大小")
    model_metadata: dict[str, Any] = Field(default_factory=dict, description="扩展元数据")
    enabled: bool = Field(True, description="是否启用")
    sort_order: int = Field(0, ge=0, description="排序")


class AIModelCreate(AIModelBase):
    manufacturer_id: UUID = Field(..., description="关联的厂商 ID")


class AIModelUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=128)
    name: str | None = Field(None, min_length=1, max_length=128)
    response_format: str | None = Field(None, pattern="^(schema|object)$")
    model_capabilities: dict[str, Any] | None = None
    category: str | None = Field(None, pattern="^(text|image|video)$")
    supports_image: bool | None = None
    supports_think: bool | None = None
    supports_tool: bool | None = None
    context_window: int | None = Field(None, ge=0)
    metadata: dict[str, Any] | None = None
    enabled: bool | None = None
    sort_order: int | None = Field(None, ge=0)


class AIModelRead(BaseModel):
    id: UUID
    manufacturer_id: UUID
    code: str
    name: str
    response_format: str
    model_capabilities: dict[str, Any]
    category: str | None
    supports_image: bool
    supports_think: bool
    supports_tool: bool
    context_window: int | None
    model_metadata: dict[str, Any]
    enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIModelWithManufacturerRead(AIModelRead):
    manufacturer: AIManufacturerRead | None = None


class AIManufacturerWithModelsRead(AIManufacturerRead):
    models: list[AIModelRead] = []


class AICatalogItem(BaseModel):
    manufacturer_code: str
    manufacturer_name: str
    model_code: str
    model_name: str
    category: str
    response_format: str
    supports_image: bool
    supports_think: bool
    supports_tool: bool
    default_base_url: str | None


# ==================== 模型能力查询 API 响应 ====================


class ModelWithCapabilities(BaseModel):
    code: str
    name: str
    model_capabilities: dict[str, Any] = Field(default_factory=dict)
    param_schema: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ManufacturerWithModels(BaseModel):
    code: str
    name: str
    models: list[ModelWithCapabilities] = []
