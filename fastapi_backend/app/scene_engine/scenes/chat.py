from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_runtime.chatbox_deps import ChatboxDeps
from app.ai_runtime.pydanticai_model_factory import resolve_text_model_for_pydantic_ai
from app.ai_tools.registry import CHATBOX_TOOL_FUNCTIONS
from app.services.agent_factory import resolve_builtin_agent


class ChatInput(BaseModel):
    message: str = Field(min_length=1)
    agent_code: str = Field(default="script_expert", min_length=1)
    binding_key: str | None = None


class ChatOutput(BaseModel):
    output_text: str


async def run_chat(
    *,
    db: AsyncSession,
    user_id: UUID,
    payload: ChatInput,
) -> ChatOutput:
    agent_cfg = await resolve_builtin_agent(session=db, agent_code=payload.agent_code, user_id=user_id)
    resolved = await resolve_text_model_for_pydantic_ai(
        db=db,
        binding_key=payload.binding_key,
        ai_model_config_id=agent_cfg.ai_model_config_id,
    )

    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = OpenAIProvider(api_key=resolved.api_key, base_url=resolved.base_url)
    model = OpenAIChatModel(resolved.model_name, provider=provider)
    agent = Agent(
        model=model,
        instructions=agent_cfg.system_prompt,
        deps_type=ChatboxDeps,
        tools=CHATBOX_TOOL_FUNCTIONS,
        model_settings=agent_cfg.model_settings,
    )
    result = await agent.run(payload.message, deps=ChatboxDeps(db=db, user_id=user_id))
    return ChatOutput(output_text=str(result.output))
