from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service


@dataclass(frozen=True)
class PydanticAIResolvedModel:
    model_name: str
    base_url: str | None
    api_key: str
    ai_model_config_id: UUID
    binding_key: str | None


async def resolve_text_model_for_pydantic_ai(
    *,
    db: AsyncSession,
    binding_key: str | None,
    ai_model_config_id: UUID | None,
) -> PydanticAIResolvedModel:
    cfg, cfg_id, resolved_binding_key = await ai_gateway_service._resolve_model_config(
        db=db,
        category="text",
        binding_key=binding_key,
        model_config_id=ai_model_config_id,
        default_binding_key="chatbox",
    )
    return PydanticAIResolvedModel(
        model_name=cfg.model,
        base_url=(cfg.base_url or None),
        api_key=cfg.api_key,
        ai_model_config_id=cfg_id,
        binding_key=resolved_binding_key,
    )

