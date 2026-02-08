from __future__ import annotations

from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LLMCustomService


class LLMCustomServiceRepository:
    async def list_services(self, *, db: AsyncSession) -> list[LLMCustomService]:
        rows = (
            await db.execute(select(LLMCustomService).order_by(LLMCustomService.created_at.desc()))
        ).scalars().all()
        return list(rows)

    async def get_service(self, *, db: AsyncSession, service_id: UUID) -> LLMCustomService | None:
        return (await db.execute(select(LLMCustomService).where(LLMCustomService.id == service_id))).scalars().first()

    async def create_service(
        self,
        *,
        db: AsyncSession,
        name: str,
        kind: str,
        base_url: str,
        supported_models: list[str],
        created_models: list[str],
        encrypted_api_key: bytes,
        enabled: bool,
    ) -> LLMCustomService:
        row = LLMCustomService(
            name=name,
            kind=kind,
            base_url=base_url,
            supported_models=supported_models,
            created_models=created_models,
            encrypted_api_key=encrypted_api_key,
            enabled=enabled,
        )
        db.add(row)
        await db.flush()
        return row

    async def set_created_models(
        self,
        *,
        db: AsyncSession,
        service_id: UUID,
        created_models: list[str],
    ) -> None:
        await db.execute(
            update(LLMCustomService)
            .where(LLMCustomService.id == service_id)
            .values(created_models=created_models)
        )


llm_custom_service_repository = LLMCustomServiceRepository()

