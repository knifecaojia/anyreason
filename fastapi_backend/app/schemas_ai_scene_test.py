from __future__ import annotations

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
    main_agent: AISceneTestAgentSelect
    sub_agents: list[AISceneTestAgentSelect] = Field(default_factory=list)
    tool_ids: list[str] = Field(default_factory=list)
    script_text: str = Field(default="", description="用户粘贴的剧本文本")
    messages: list[AISceneTestChatMessage] = Field(default_factory=list)


class AISceneTestChatResponse(BaseModel):
    output_text: str
    plans: list[ApplyPlan] = Field(default_factory=list)

