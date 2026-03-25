from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.crypto import build_fernet
from app.models import AIModelBinding, AIModelConfig


def _normalize_str(v: str | None) -> str:
    return (v or "").strip()


def _normalize_optional_str(v: str | None) -> str | None:
    s = _normalize_str(v)
    return s or None


class AIModelConfigService:
    def _fernet(self):
        return build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))

    async def list(
        self,
        *,
        db: AsyncSession,
        category: str | None = None,
    ) -> list[AIModelConfig]:
        q = select(AIModelConfig)
        if category:
            q = q.where(AIModelConfig.category == category)
        q = q.order_by(AIModelConfig.category.asc(), AIModelConfig.sort_order.asc(), AIModelConfig.created_at.asc())
        return list((await db.execute(q)).scalars().all())

    async def get(self, *, db: AsyncSession, model_config_id: UUID) -> AIModelConfig | None:
        return (await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_config_id))).scalars().first()

    async def create(
        self,
        *,
        db: AsyncSession,
        category: str,
        manufacturer: str,
        provider: str | None,
        model: str,
        base_url: str | None,
        api_key: str | None,
        plaintext_api_key: str | None,
        api_keys_info: list | None,
        enabled: bool,
        sort_order: int,
        credits_cost: int = 0,
    ) -> AIModelConfig:
        manufacturer = _normalize_str(manufacturer)
        provider = _normalize_optional_str(provider)
        model = _normalize_str(model)
        base_url = _normalize_optional_str(base_url)
        api_key = _normalize_optional_str(api_key)
        if not manufacturer:
            raise AppError(msg="manufacturer is required", code=400, status_code=400)
        if not model:
            raise AppError(msg="model is required", code=400, status_code=400)
        encrypted_api_key = self._fernet().encrypt(api_key.encode("utf-8")) if api_key else None

        row = AIModelConfig(
            category=category,
            manufacturer=manufacturer,
            provider=provider,
            model=model,
            base_url=base_url,
            plaintext_api_key=plaintext_api_key or api_key,
            api_keys_info=[x.model_dump(mode="json") if hasattr(x, "model_dump") else x for x in api_keys_info] if api_keys_info else None,
            enabled=bool(enabled),
            sort_order=int(sort_order or 0),
            credits_cost=max(0, int(credits_cost or 0)),
        )
        db.add(row)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Model config already exists", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def update(
        self,
        *,
        db: AsyncSession,
        model_config_id: UUID,
        patch: dict,
    ) -> AIModelConfig:
        row = await self.get(db=db, model_config_id=model_config_id)
        if row is None:
            raise AppError(msg="Model config not found", code=404, status_code=404)

        if "manufacturer" in patch and patch["manufacturer"] is not None:
            row.manufacturer = _normalize_str(patch["manufacturer"])
        if "provider" in patch:
            row.provider = _normalize_optional_str(patch["provider"])
        if "model" in patch and patch["model"] is not None:
            row.model = _normalize_str(patch["model"])
        if "category" in patch and patch["category"] is not None:
            row.category = patch["category"]
        if "base_url" in patch and patch["base_url"] is not None:
            row.base_url = _normalize_optional_str(patch["base_url"])
        if "enabled" in patch and patch["enabled"] is not None:
            row.enabled = bool(patch["enabled"])
        if "sort_order" in patch and patch["sort_order"] is not None:
            row.sort_order = int(patch["sort_order"])
        if "credits_cost" in patch and patch["credits_cost"] is not None:
            row.credits_cost = max(0, int(patch["credits_cost"]))

        if "api_key" in patch and patch["api_key"] is not None:
            row.plaintext_api_key = _normalize_str(patch["api_key"]) or None
        if "plaintext_api_key" in patch and patch["plaintext_api_key"] is not None:
            row.plaintext_api_key = _normalize_str(patch["plaintext_api_key"]) or None
        
        if "api_keys_info" in patch and patch["api_keys_info"] is not None:
            # Pydantic model dump might need serialization
            val = patch["api_keys_info"]
            if isinstance(val, list):
                row.api_keys_info = [x.model_dump(mode="json") if hasattr(x, "model_dump") else x for x in val]
            else:
                row.api_keys_info = val

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Model config already exists", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def delete(self, *, db: AsyncSession, model_config_id: UUID) -> None:
        row = await self.get(db=db, model_config_id=model_config_id)
        if row is None:
            return
        await db.delete(row)
        await db.commit()


class AIModelBindingService:
    async def list(
        self,
        *,
        db: AsyncSession,
        category: str | None = None,
    ) -> list[AIModelBinding]:
        q = select(AIModelBinding)
        if category:
            q = q.where(AIModelBinding.category == category)
        q = q.order_by(AIModelBinding.category.asc(), AIModelBinding.key.asc())
        return list((await db.execute(q)).scalars().all())

    async def get_by_key(self, *, db: AsyncSession, key: str) -> AIModelBinding | None:
        return (await db.execute(select(AIModelBinding).where(AIModelBinding.key == key))).scalars().first()

    async def upsert(
        self,
        *,
        db: AsyncSession,
        key: str,
        category: str,
        ai_model_config_id: UUID | None,
    ) -> AIModelBinding:
        key = _normalize_str(key)
        if not key:
            raise AppError(msg="key is required", code=400, status_code=400)

        if ai_model_config_id is not None:
            cfg = (
                await db.execute(select(AIModelConfig).where(AIModelConfig.id == ai_model_config_id))
            ).scalars().first()
            if cfg is None:
                raise AppError(msg="Model config not found", code=404, status_code=404)
            if cfg.category != category:
                raise AppError(msg="Model category mismatch", code=400, status_code=400)

        row = await self.get_by_key(db=db, key=key)
        if row is None:
            row = AIModelBinding(key=key, category=category, ai_model_config_id=ai_model_config_id)
            db.add(row)
        else:
            row.category = category
            row.ai_model_config_id = ai_model_config_id

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Binding key already exists", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def delete(self, *, db: AsyncSession, binding_id: UUID) -> None:
        row = (await db.execute(select(AIModelBinding).where(AIModelBinding.id == binding_id))).scalars().first()
        if row is None:
            return
        await db.delete(row)
        await db.commit()


ai_model_config_service = AIModelConfigService()
ai_model_binding_service = AIModelBindingService()
