from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import AssetVariant
from app.repositories import asset_repository
from app.schemas import AssetRead


class AssetService:
    async def get_asset_full(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        asset_id: UUID,
    ) -> AssetRead | None:
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            return None
        tags = await asset_repository.list_asset_tags(db=db, asset_entity_id=asset.id)
        variants = await asset_repository.list_variants(db=db, asset_entity_id=asset.id)
        return AssetRead(
            id=asset.id,
            project_id=asset.project_id,
            asset_id=asset.asset_id,
            name=asset.name,
            type=str(asset.type),
            category=asset.category,
            lifecycle_status=asset.lifecycle_status,
            tags=tags,
            variants=[
                {
                    "id": v.id,
                    "asset_entity_id": v.asset_entity_id,
                    "variant_code": v.variant_code,
                    "stage_tag": v.stage_tag,
                    "age_range": v.age_range,
                    "attributes": dict(v.attributes or {}),
                    "prompt_template": v.prompt_template,
                    "is_default": bool(v.is_default),
                }
                for v in variants
            ],
        )

    async def update_asset(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        asset_id: UUID,
        name: str | None,
        category: str | None,
        lifecycle_status: str | None,
        tags: list[str] | None,
    ) -> AssetRead | None:
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            return None

        if name is not None:
            asset.name = name.strip()[:100]
        if category is not None:
            asset.category = (category.strip() or None)[:50] if category is not None else None
        if lifecycle_status is not None:
            asset.lifecycle_status = lifecycle_status

        if tags is not None:
            if not asset.project_id:
                raise AppError(msg="Asset has no project", code=400, status_code=400)
            await asset_repository.replace_asset_tags(
                db=db,
                project_id=asset.project_id,
                asset_entity_id=asset.id,
                tags=tags,
            )

        await db.commit()
        return await self.get_asset_full(db=db, user_id=user_id, asset_id=asset.id)

    async def create_variant(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        asset_id: UUID,
        variant_code: str | None,
        stage_tag: str | None,
        age_range: str | None,
        attributes: dict | None,
        prompt_template: str | None,
        is_default: bool | None,
    ) -> AssetRead | None:
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            return None

        code = (variant_code or "").strip()
        if not code:
            existing = await asset_repository.list_variants(db=db, asset_entity_id=asset.id)
            nums = []
            for v in existing:
                m = v.variant_code.strip().lstrip("V")
                if m.isdigit():
                    nums.append(int(m))
            next_num = (max(nums) if nums else 0) + 1
            code = f"V{next_num}"

        await asset_repository.create_variant(
            db=db,
            asset_entity_id=asset.id,
            variant_code=code[:50],
            stage_tag=(stage_tag or "").strip() or None,
            age_range=(age_range or "").strip() or None,
            attributes=attributes or {},
            prompt_template=prompt_template,
            is_default=bool(is_default) if is_default is not None else False,
        )
        await db.commit()
        return await self.get_asset_full(db=db, user_id=user_id, asset_id=asset.id)

    async def update_variant(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        variant_id: UUID,
        stage_tag: str | None,
        age_range: str | None,
        attributes: dict | None,
        prompt_template: str | None,
        is_default: bool | None,
    ) -> AssetRead | None:
        res = await db.execute(
            select(AssetVariant).where(AssetVariant.id == variant_id)
        )
        variant = res.scalars().first()
        if not variant:
            return None
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=variant.asset_entity_id)
        if not asset:
            return None
        await asset_repository.update_variant(
            db=db,
            variant=variant,
            stage_tag=stage_tag,
            age_range=age_range,
            attributes=attributes,
            prompt_template=prompt_template,
            is_default=is_default,
        )
        await db.commit()
        return await self.get_asset_full(db=db, user_id=user_id, asset_id=asset.id)

    async def delete_variant(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        variant_id: UUID,
    ) -> AssetRead | None:
        res = await db.execute(select(AssetVariant).where(AssetVariant.id == variant_id))
        variant = res.scalars().first()
        if not variant:
            return None
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=variant.asset_entity_id)
        if not asset:
            return None
        await asset_repository.delete_variant(db=db, variant=variant)
        await db.commit()
        return await self.get_asset_full(db=db, user_id=user_id, asset_id=asset.id)


asset_service = AssetService()
