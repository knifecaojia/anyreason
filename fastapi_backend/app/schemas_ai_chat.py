from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AIChatSessionCreate(BaseModel):
    project_id: UUID | None = Field(default=None, description="关联项目 ID")
    scene_code: str = Field(min_length=1, description="场景代码")
    title: str | None = Field(default=None, max_length=255, description="会话标题")


class AIChatSessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255, description="新标题")


class AIChatMessageRead(BaseModel):
    id: UUID
    role: str
    content: str
    plans: list[dict] | None = None
    trace: list[dict] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIChatSessionRead(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID | None
    title: str
    scene_code: str
    created_at: datetime
    updated_at: datetime
    messages: list[AIChatMessageRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AIChatSessionListItem(BaseModel):
    id: UUID
    title: str
    scene_code: str
    created_at: datetime
    updated_at: datetime
    message_count: int = Field(default=0)

    model_config = {"from_attributes": True}


class AIChatSessionListResponse(BaseModel):
    items: list[AIChatSessionListItem]
    total: int
    page: int
    page_size: int


class AIChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, description="用户消息内容")
    scene_code: str | None = Field(default=None, description="可选：切换场景")
    episode_id: UUID | None = Field(default=None, description="可选：指定剧集ID")


class AIChatMessageStreamStart(BaseModel):
    type: str = "start"
    session_id: UUID


class AIChatMessageStreamDelta(BaseModel):
    type: str = "delta"
    delta: str


class AIChatMessageStreamToolEvent(BaseModel):
    type: str = "tool_event"
    event: dict


class AIChatMessageStreamPlans(BaseModel):
    type: str = "plans"
    plans: list[dict]


class AIChatMessageStreamDone(BaseModel):
    type: str = "done"
    message_id: UUID
    content: str
    plans: list[dict] | None = None
    trace: list[dict] | None = None
