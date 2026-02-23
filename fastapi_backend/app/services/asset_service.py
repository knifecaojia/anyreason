from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import AssetVariant, FileNode, Script, AssetResource
from app.repositories import asset_repository
from app.schemas import AssetRead


class AssetService:
    async def get_resource_for_download(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        asset_id: UUID,
        resource_id: UUID,
    ) -> AssetResource | None:
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            return None
        
        stmt = (
            select(AssetResource)
            .join(AssetVariant, AssetResource.variant_id == AssetVariant.id)
            .where(
                AssetResource.id == resource_id,
                AssetVariant.asset_entity_id == asset.id
            )
        )
        res = await db.execute(stmt)
        return res.scalars().first()

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
        resources = await asset_repository.list_resources_by_asset(db=db, asset_entity_id=asset.id)
        return AssetRead(
            id=asset.id,
            project_id=asset.project_id,
            script_id=asset.script_id,
            doc_node_id=asset.doc_node_id,
            asset_id=asset.asset_id,
            name=asset.name,
            type=str(asset.type),
            category=asset.category,
            lifecycle_status=asset.lifecycle_status,
            source=asset.source,
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
            resources=[
                {
                    "id": r.id,
                    "variant_id": r.variant_id,
                    "res_type": r.res_type,
                    "minio_bucket": r.minio_bucket,
                    "minio_key": r.minio_key,
                    "meta_data": dict(r.meta_data or {}),
                }
                for r in resources
            ],
        )

    async def list_assets(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        project_id: UUID | None = None,
        script_id: UUID | None = None,
        source: str | None = None,
    ) -> list[AssetRead]:
        assets = await asset_repository.list_assets(
            db=db,
            user_id=user_id,
            project_id=project_id,
            script_id=script_id,
            source=source,
        )
        
        results = []
        for asset in assets:
            # Re-use logic to fetch related data
            # Note: Ideally this should be optimized to batch fetch
            tags = await asset_repository.list_asset_tags(db=db, asset_entity_id=asset.id)
            variants = await asset_repository.list_variants(db=db, asset_entity_id=asset.id)
            resources = await asset_repository.list_resources_by_asset(db=db, asset_entity_id=asset.id)
            
            results.append(AssetRead(
                id=asset.id,
                project_id=asset.project_id,
                script_id=asset.script_id,
                doc_node_id=asset.doc_node_id,
                asset_id=asset.asset_id,
                name=asset.name,
                type=str(asset.type),
                category=asset.category,
                lifecycle_status=asset.lifecycle_status,
                source=asset.source,
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
                resources=[
                    {
                        "id": r.id,
                        "variant_id": r.variant_id,
                        "res_type": r.res_type,
                        "minio_bucket": r.minio_bucket,
                        "minio_key": r.minio_key,
                        "meta_data": dict(r.meta_data or {}),
                    }
                    for r in resources
                ],
            ))
        return results

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

    async def create_asset(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        name: str,
        type: str,
        project_id: UUID | None = None,
        script_id: UUID | None = None,
        category: str | None = None,
        source: str = "manual",
        doc_node_id: UUID | None = None,
    ) -> AssetRead | None:
        import uuid
        # Generate a simple asset_id
        asset_code = f"A-{uuid.uuid4().hex[:8].upper()}"
        
        asset = await asset_repository.create_asset(
            db=db,
            asset_id=asset_code,
            name=name,
            type=type,
            project_id=project_id,
            script_id=script_id,
            category=category,
            source=source,
            doc_node_id=doc_node_id,
        )
        
        # Create default variant
        await asset_repository.create_variant(
            db=db,
            asset_entity_id=asset.id,
            variant_code="V1",
            stage_tag=None,
            age_range=None,
            attributes={},
            prompt_template=None,
            is_default=True,
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

    async def create_resources(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        asset_id: UUID,
        file_node_ids: list[UUID],
        res_type: str | None,
        variant_id: UUID | None,
        cover_file_node_id: UUID | None,
    ) -> AssetRead | None:
        asset = await asset_repository.get_asset_for_user(db=db, user_id=user_id, asset_id=asset_id)
        if not asset:
            return None
        if not asset.project_id:
            raise AppError(msg="Asset has no project", code=400, status_code=400)
        resolved_variant = None
        if variant_id:
            resolved_variant = await asset_repository.get_variant(db=db, variant_id=variant_id)
            if not resolved_variant or resolved_variant.asset_entity_id != asset.id:
                raise AppError(msg="Asset variant not found", code=404, status_code=404)
        else:
            variants = await asset_repository.list_variants(db=db, asset_entity_id=asset.id)
            default_variant = next((v for v in variants if v.is_default), None)
            if not default_variant and variants:
                default_variant = variants[0]
                default_variant.is_default = True
            if not default_variant:
                default_variant = await asset_repository.create_variant(
                    db=db,
                    asset_entity_id=asset.id,
                    variant_code="V1",
                    stage_tag=None,
                    age_range=None,
                    attributes={},
                    prompt_template=None,
                    is_default=True,
                )
            resolved_variant = default_variant

        if not file_node_ids:
            raise AppError(msg="No file nodes provided", code=400, status_code=400)

        nodes_res = await db.execute(select(FileNode).where(FileNode.id.in_(file_node_ids)))
        nodes = {node.id: node for node in nodes_res.scalars().all()}
        for node_id in file_node_ids:
            node = nodes.get(node_id)
            if not node or node.is_folder:
                raise AppError(msg="File node not found", code=404, status_code=404)
            if node.project_id != asset.project_id:
                raise AppError(msg="File node not in asset project", code=400, status_code=400)
            script_res = await db.execute(
                select(Script).where(Script.id == node.project_id, Script.owner_id == user_id, Script.is_deleted.is_(False))
            )
            if not script_res.scalars().first():
                raise AppError(msg="File node not found", code=404, status_code=404)
            meta = {
                "file_node_id": str(node.id),
                "file_name": node.name,
                "content_type": node.content_type,
                "size_bytes": node.size_bytes,
                "is_cover": bool(cover_file_node_id and node.id == cover_file_node_id),
            }
            await asset_repository.create_resource(
                db=db,
                variant_id=resolved_variant.id,
                res_type=(res_type or "image").strip() or "image",
                minio_bucket=node.minio_bucket,
                minio_key=node.minio_key,
                meta_data=meta,
            )
        await db.commit()
        return await self.get_asset_full(db=db, user_id=user_id, asset_id=asset.id)


asset_service = AssetService()
