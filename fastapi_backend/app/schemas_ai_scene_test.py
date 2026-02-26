from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.ai_tools.apply_plan import ApplyPlan


class AISceneTestAgentSelect(BaseModel):
    agent_code: str = Field(min_length=1)
    version: int = Field(ge=1)


class AISceneTestToolOption(BaseModel):
    tool_id: str
    label: str
    uses_agent_codes: list[str] = Field(default_factory=list)


class AISceneTestAgentVersionOption(BaseModel):
    version: int
    is_default: bool
    description: str | None = None
    created_at: str | None = None


class AISceneTestAgentOption(BaseModel):
    agent_code: str
    name: str
    category: str
    versions: list[AISceneTestAgentVersionOption] = Field(default_factory=list)


class AISceneTestOptionsResponse(BaseModel):
    agents: list[AISceneTestAgentOption]
    tools: list[AISceneTestToolOption]


class AISceneTestChatMessage(BaseModel):
    role: str
    content: str


class AISceneTestChatRequest(BaseModel):
    scene_code: str | None = Field(default=None, description="可选：当前测试关联的场景标识（便于追踪与审计）")
    main_agent: AISceneTestAgentSelect
    sub_agents: list[AISceneTestAgentSelect] = Field(default_factory=list)
    tool_ids: list[str] = Field(default_factory=list)
    script_text: str = Field(default="", description="用户粘贴的剧本文本")
    messages: list[AISceneTestChatMessage] = Field(default_factory=list)
    project_id: UUID | None = Field(default=None, description="可选：用于上下文注入与归档的项目 ID")
    session_id: UUID | None = Field(default=None, description="可选：关联的会话 ID，用于持久化消息")
    context_exclude_types: list[str] = Field(default_factory=list, description="可选：上下文注入排除的资产类型")


class AISceneTestChatResponse(BaseModel):
    output_text: str
    plans: list[ApplyPlan] = Field(default_factory=list)
    archive: dict | None = None
