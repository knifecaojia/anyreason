from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.repositories import ai_prompt_preset_repository


class AIPromptPresetService:
    async def list_presets(self, *, db: AsyncSession, user_id: UUID, tool_key: str | None):
        return await ai_prompt_preset_repository.list_presets(db=db, user_id=user_id, tool_key=tool_key)

    async def create_preset(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        tool_key: str,
        group: str | None,
        name: str,
        provider: str | None,
        model: str | None,
        prompt_template: str,
        is_default: bool,
    ):
        if is_default:
            await ai_prompt_preset_repository.unset_default_for_tool(db=db, user_id=user_id, tool_key=tool_key)
            await db.commit()
        return await ai_prompt_preset_repository.create_preset(
            db=db,
            user_id=user_id,
            tool_key=tool_key,
            group=group,
            name=name,
            provider=provider,
            model=model,
            prompt_template=prompt_template,
            is_default=is_default,
        )

    async def update_preset(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        preset_id: UUID,
        patch: dict,
    ):
        preset = await ai_prompt_preset_repository.get_preset(db=db, user_id=user_id, preset_id=preset_id)
        if not preset:
            raise AppError(msg="Preset not found", code=404, status_code=404)
        if patch.get("is_default") is True:
            await ai_prompt_preset_repository.unset_default_for_tool(db=db, user_id=user_id, tool_key=preset.tool_key)
            await db.commit()
        return await ai_prompt_preset_repository.update_preset(db=db, preset=preset, patch=patch)

    async def delete_preset(self, *, db: AsyncSession, user_id: UUID, preset_id: UUID) -> bool:
        return await ai_prompt_preset_repository.delete_preset(db=db, user_id=user_id, preset_id=preset_id)


ai_prompt_preset_service = AIPromptPresetService()

