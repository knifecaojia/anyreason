from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, AssetResource, AssetTag, AssetTagRelation, AssetVariant, Project, Script


async def get_asset_for_user(*, db: AsyncSession, user_id: UUID, asset_id: UUID) -> Asset | None:
    stmt = (
        select(Asset)
        .outerjoin(Project, Asset.project_id == Project.id)
        .outerjoin(Script, Asset.script_id == Script.id)
        .where(
            Asset.id == asset_id,
            (Project.owner_id == user_id) | (Script.owner_id == user_id),
        )
    )
    res = await db.execute(stmt)
    return res.scalars().first()


async def create_asset(
    *,
    db: AsyncSession,
    asset_id: str,
    name: str,
    type: str,
    project_id: UUID | None = None,
    script_id: UUID | None = None,
    category: str | None = None,
    source: str = "manual",
    doc_node_id: UUID | None = None,
) -> Asset:
    row = Asset(
        project_id=project_id,
        script_id=script_id,
        asset_id=asset_id,
        name=name,
        type=type,
        category=category,
        source=source,
        doc_node_id=doc_node_id,
    )
    db.add(row)
    await db.flush()
    return row


async def list_assets(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID | None = None,
    script_id: UUID | None = None,
    source: str | None = None,
) -> list[Asset]:
    stmt = (
        select(Asset)
        .outerjoin(Project, Asset.project_id == Project.id)
        .outerjoin(Script, Asset.script_id == Script.id)
        .where(
            (Project.owner_id == user_id) | (Script.owner_id == user_id)
        )
    )

    if project_id:
        stmt = stmt.where(Asset.project_id == project_id)
    if script_id:
        stmt = stmt.where(Asset.script_id == script_id)
    if source:
        stmt = stmt.where(Asset.source == source)

    stmt = stmt.where(Asset.lifecycle_status != "archived")

    stmt = stmt.order_by(Asset.created_at.desc())

    res = await db.execute(stmt)
    return list(res.scalars().all())


async def list_asset_tags(*, db: AsyncSession, asset_entity_id: UUID) -> list[str]:
    res = await db.execute(
        select(AssetTag.name)
        .join(AssetTagRelation, AssetTagRelation.tag_id == AssetTag.id)
        .where(AssetTagRelation.asset_entity_id == asset_entity_id)
        .order_by(AssetTag.name.asc())
    )
    return [str(x) for x in res.scalars().all()]


async def replace_asset_tags(
    *,
    db: AsyncSession,
    project_id: UUID,
    asset_entity_id: UUID,
    tags: list[str],
) -> None:
    cleaned = []
    seen = set()
    for t in tags or []:
        name = str(t or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name[:64])

    await db.execute(delete(AssetTagRelation).where(AssetTagRelation.asset_entity_id == asset_entity_id))
    await db.flush()

    for name in cleaned:
        tag_res = await db.execute(select(AssetTag).where(AssetTag.project_id == project_id, AssetTag.name == name))
        tag = tag_res.scalars().first()
        if not tag:
            tag = AssetTag(project_id=project_id, name=name)
            db.add(tag)
            await db.flush()
        db.add(AssetTagRelation(asset_entity_id=asset_entity_id, tag_id=tag.id))


async def list_variants(*, db: AsyncSession, asset_entity_id: UUID) -> list[AssetVariant]:
    res = await db.execute(select(AssetVariant).where(AssetVariant.asset_entity_id == asset_entity_id).order_by(AssetVariant.variant_code.asc()))
    return list(res.scalars().all())


async def get_variant(*, db: AsyncSession, variant_id: UUID) -> AssetVariant | None:
    res = await db.execute(select(AssetVariant).where(AssetVariant.id == variant_id))
    return res.scalars().first()


async def create_variant(
    *,
    db: AsyncSession,
    asset_entity_id: UUID,
    variant_code: str,
    stage_tag: str | None,
    age_range: str | None,
    attributes: dict,
    prompt_template: str | None,
    is_default: bool,
) -> AssetVariant:
    if is_default:
        await db.execute(
            select(AssetVariant)
            .where(AssetVariant.asset_entity_id == asset_entity_id, AssetVariant.is_default.is_(True))
        )
        res = await db.execute(select(AssetVariant).where(AssetVariant.asset_entity_id == asset_entity_id))
        for v in res.scalars().all():
            v.is_default = False

    row = AssetVariant(
        asset_entity_id=asset_entity_id,
        variant_code=variant_code,
        stage_tag=stage_tag,
        age_range=age_range,
        attributes=attributes or {},
        prompt_template=prompt_template,
        is_default=bool(is_default),
    )
    db.add(row)
    await db.flush()
    return row


async def update_variant(
    *,
    db: AsyncSession,
    variant: AssetVariant,
    stage_tag: str | None,
    age_range: str | None,
    attributes: dict | None,
    prompt_template: str | None,
    is_default: bool | None,
    doc_node_id: UUID | None = None,
) -> AssetVariant:
    if stage_tag is not None:
        variant.stage_tag = stage_tag
    if age_range is not None:
        variant.age_range = age_range
    if attributes is not None:
        variant.attributes = attributes
    if prompt_template is not None:
        variant.prompt_template = prompt_template
    if is_default is not None:
        if is_default:
            res = await db.execute(select(AssetVariant).where(AssetVariant.asset_entity_id == variant.asset_entity_id))
            for v in res.scalars().all():
                v.is_default = False
        variant.is_default = bool(is_default)
    if doc_node_id is not None:
        variant.doc_node_id = doc_node_id
    await db.flush()
    return variant


async def delete_variant(*, db: AsyncSession, variant: AssetVariant) -> None:
    await db.delete(variant)
    await db.flush()


async def list_resources_by_asset(*, db: AsyncSession, asset_entity_id: UUID) -> list[AssetResource]:
    res = await db.execute(
        select(AssetResource)
        .join(AssetVariant, AssetResource.variant_id == AssetVariant.id)
        .where(AssetVariant.asset_entity_id == asset_entity_id)
        .order_by(AssetResource.created_at.asc())
    )
    return list(res.scalars().all())


async def create_resource(
    *,
    db: AsyncSession,
    variant_id: UUID,
    res_type: str,
    minio_bucket: str,
    minio_key: str,
    meta_data: dict,
    is_cover: bool = False,
) -> AssetResource:
    row = AssetResource(
        variant_id=variant_id,
        res_type=res_type,
        minio_bucket=minio_bucket,
        minio_key=minio_key,
        meta_data=meta_data,
        is_cover=is_cover,
    )
    db.add(row)
    await db.flush()
    return row
