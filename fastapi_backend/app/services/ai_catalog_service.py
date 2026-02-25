from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models import AIManufacturer, AIModel


def _normalize_str(v: str | None) -> str:
    return (v or "").strip()


class AIManufacturerService:
    async def list(
        self,
        *,
        db: AsyncSession,
        category: str | None = None,
        enabled_only: bool = False,
    ) -> list[AIManufacturer]:
        q = select(AIManufacturer)
        if category:
            q = q.where(AIManufacturer.category == category)
        if enabled_only:
            q = q.where(AIManufacturer.enabled == True)
        q = q.order_by(AIManufacturer.category.asc(), AIManufacturer.sort_order.asc(), AIManufacturer.created_at.asc())
        return list((await db.execute(q)).scalars().all())

    async def get(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID,
    ) -> AIManufacturer | None:
        return (
            await db.execute(select(AIManufacturer).where(AIManufacturer.id == manufacturer_id))
        ).scalars().first()

    async def get_by_code(
        self,
        *,
        db: AsyncSession,
        code: str,
        category: str,
    ) -> AIManufacturer | None:
        return (
            await db.execute(
                select(AIManufacturer).where(
                    AIManufacturer.code == code,
                    AIManufacturer.category == category,
                )
            )
        ).scalars().first()

    async def create(
        self,
        *,
        db: AsyncSession,
        code: str,
        name: str,
        category: str,
        provider_class: str | None = None,
        default_base_url: str | None = None,
        logo_url: str | None = None,
        description: str | None = None,
        enabled: bool = True,
        sort_order: int = 0,
    ) -> AIManufacturer:
        code = _normalize_str(code)
        name = _normalize_str(name)
        if not code:
            raise AppError(msg="code is required", code=400, status_code=400)
        if not name:
            raise AppError(msg="name is required", code=400, status_code=400)

        row = AIManufacturer(
            code=code,
            name=name,
            category=category,
            provider_class=_normalize_str(provider_class) or None,
            default_base_url=_normalize_str(default_base_url) or None,
            logo_url=_normalize_str(logo_url) or None,
            description=description,
            enabled=bool(enabled),
            sort_order=int(sort_order or 0),
        )
        db.add(row)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Manufacturer already exists with this code in this category", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def update(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID,
        patch: dict,
    ) -> AIManufacturer:
        row = await self.get(db=db, manufacturer_id=manufacturer_id)
        if row is None:
            raise AppError(msg="Manufacturer not found", code=404, status_code=404)

        if "code" in patch and patch["code"] is not None:
            row.code = _normalize_str(patch["code"])
        if "name" in patch and patch["name"] is not None:
            row.name = _normalize_str(patch["name"])
        if "category" in patch and patch["category"] is not None:
            row.category = patch["category"]
        if "provider_class" in patch:
            row.provider_class = _normalize_str(patch["provider_class"]) or None
        if "default_base_url" in patch:
            row.default_base_url = _normalize_str(patch["default_base_url"]) or None
        if "logo_url" in patch:
            row.logo_url = _normalize_str(patch["logo_url"]) or None
        if "description" in patch:
            row.description = patch["description"]
        if "enabled" in patch and patch["enabled"] is not None:
            row.enabled = bool(patch["enabled"])
        if "sort_order" in patch and patch["sort_order"] is not None:
            row.sort_order = int(patch["sort_order"])

        row.updated_at = datetime.utcnow()

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Manufacturer already exists with this code in this category", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def delete(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID,
    ) -> None:
        row = await self.get(db=db, manufacturer_id=manufacturer_id)
        if row is None:
            return
        await db.delete(row)
        await db.commit()


class AIModelService:
    async def list(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID | None = None,
        category: str | None = None,
        enabled_only: bool = False,
        with_manufacturer: bool = False,
    ) -> list[AIModel]:
        q = select(AIModel)
        if with_manufacturer:
            q = q.options(selectinload(AIModel.manufacturer))
        if manufacturer_id:
            q = q.where(AIModel.manufacturer_id == manufacturer_id)
        if enabled_only:
            q = q.where(AIModel.enabled == True)
        if category and with_manufacturer:
            q = q.join(AIManufacturer).where(AIManufacturer.category == category)
        q = q.order_by(AIModel.sort_order.asc(), AIModel.created_at.asc())
        return list((await db.execute(q)).scalars().all())
    async def list_with_capabilities(
        self,
        *,
        db: AsyncSession,
        category: str,
        enabled_only: bool = True,
    ) -> list[dict]:
        """返回指定 category 的模型，按厂商分组，包含 model_capabilities。"""
        q = (
            select(AIModel)
            .options(selectinload(AIModel.manufacturer))
            .join(AIManufacturer)
            .where(AIManufacturer.category == category)
        )
        if enabled_only:
            q = q.where(AIModel.enabled == True, AIManufacturer.enabled == True)
        q = q.order_by(AIManufacturer.sort_order, AIModel.sort_order)

        models = list((await db.execute(q)).scalars().all())

        grouped: dict[str, dict] = {}
        for m in models:
            manu = m.manufacturer
            if manu is None:
                continue
            key = manu.code
            if key not in grouped:
                grouped[key] = {
                    "code": manu.code,
                    "name": manu.name,
                    "models": [],
                }
            grouped[key]["models"].append({
                "code": m.code,
                "name": m.name,
                "model_capabilities": m.model_capabilities or {},
                "param_schema": m.param_schema or {},
                "enabled": m.enabled,
            })

        return list(grouped.values())

    async def get(
        self,
        *,
        db: AsyncSession,
        model_id: UUID,
        with_manufacturer: bool = False,
    ) -> AIModel | None:
        q = select(AIModel).where(AIModel.id == model_id)
        if with_manufacturer:
            q = q.options(selectinload(AIModel.manufacturer))
        return (await db.execute(q)).scalars().first()

    async def get_by_code(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID,
        code: str,
    ) -> AIModel | None:
        return (
            await db.execute(
                select(AIModel).where(
                    AIModel.manufacturer_id == manufacturer_id,
                    AIModel.code == code,
                )
            )
        ).scalars().first()

    async def create(
        self,
        *,
        db: AsyncSession,
        manufacturer_id: UUID,
        code: str,
        name: str,
        response_format: str = "schema",
        model_capabilities: dict | None = None,
        category: str | None = None,
        supports_image: bool = False,
        supports_think: bool = False,
        supports_tool: bool = True,
        context_window: int | None = None,
        model_metadata: dict | None = None,
        enabled: bool = True,
        sort_order: int = 0,
    ) -> AIModel:
        code = _normalize_str(code)
        name = _normalize_str(name)
        if not code:
            raise AppError(msg="code is required", code=400, status_code=400)
        if not name:
            raise AppError(msg="name is required", code=400, status_code=400)

        manufacturer = (
            await db.execute(select(AIManufacturer).where(AIManufacturer.id == manufacturer_id))
        ).scalars().first()
        if manufacturer is None:
            raise AppError(msg="Manufacturer not found", code=404, status_code=404)

        row = AIModel(
            manufacturer_id=manufacturer_id,
            code=code,
            name=name,
            response_format=response_format or "schema",
            model_capabilities=model_capabilities or {},
            category=category,
            supports_image=bool(supports_image),
            supports_think=bool(supports_think),
            supports_tool=bool(supports_tool),
            context_window=context_window,
            model_metadata=model_metadata or {},
            enabled=bool(enabled),
            sort_order=int(sort_order or 0),
        )
        db.add(row)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Model already exists with this code for this manufacturer", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def update(
        self,
        *,
        db: AsyncSession,
        model_id: UUID,
        patch: dict,
    ) -> AIModel:
        row = await self.get(db=db, model_id=model_id)
        if row is None:
            raise AppError(msg="Model not found", code=404, status_code=404)

        if "code" in patch and patch["code"] is not None:
            row.code = _normalize_str(patch["code"])
        if "name" in patch and patch["name"] is not None:
            row.name = _normalize_str(patch["name"])
        if "response_format" in patch and patch["response_format"] is not None:
            row.response_format = patch["response_format"]
        if "supports_image" in patch and patch["supports_image"] is not None:
            row.supports_image = bool(patch["supports_image"])
        if "supports_think" in patch and patch["supports_think"] is not None:
            row.supports_think = bool(patch["supports_think"])
        if "supports_tool" in patch and patch["supports_tool"] is not None:
            row.supports_tool = bool(patch["supports_tool"])
        if "context_window" in patch:
            row.context_window = patch["context_window"]
        if "model_metadata" in patch and patch["model_metadata"] is not None:
            row.model_metadata = patch["model_metadata"]
        if "enabled" in patch and patch["enabled"] is not None:
            row.enabled = bool(patch["enabled"])
        if "sort_order" in patch and patch["sort_order"] is not None:
            row.sort_order = int(patch["sort_order"])

        row.updated_at = datetime.utcnow()

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Model already exists with this code for this manufacturer", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def delete(
        self,
        *,
        db: AsyncSession,
        model_id: UUID,
    ) -> None:
        row = await self.get(db=db, model_id=model_id)
        if row is None:
            return
        await db.delete(row)
        await db.commit()


ai_manufacturer_service = AIManufacturerService()
ai_model_service = AIModelService()
