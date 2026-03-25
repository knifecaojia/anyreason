from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.audit import write_audit_log
from app.database import User, get_async_session
from app.models import AIModelConfig
from app.rbac import require_permissions
from app.users import current_active_user
from app.schemas_ai_catalog import (
    AIManufacturerCreate,
    AIManufacturerRead,
    AIManufacturerUpdate,
    AIModelCreate,
    AIModelRead,
    AIModelUpdate,
    AIModelWithManufacturerRead,
    AICatalogItem,
    ManufacturerWithModels,
)
from app.schemas_response import ResponseBase
from app.services.ai_catalog_service import ai_manufacturer_service, ai_model_service


router = APIRouter()


# ==================== Manufacturer APIs ====================


@router.get(
    "/ai/admin/manufacturers",
    response_model=ResponseBase[list[AIManufacturerRead]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_list_manufacturers(
    category: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AIManufacturerRead]]:
    rows = await ai_manufacturer_service.list(db=db, category=category)
    return ResponseBase(code=200, msg="OK", data=[AIManufacturerRead.model_validate(r) for r in rows])


@router.post(
    "/ai/admin/manufacturers",
    response_model=ResponseBase[AIManufacturerRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_create_manufacturer(
    request: Request,
    body: AIManufacturerCreate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIManufacturerRead]:
    row = await ai_manufacturer_service.create(
        db=db,
        code=body.code,
        name=body.name,
        category=body.category,
        provider_class=body.provider_class,
        default_base_url=body.default_base_url,
        logo_url=body.logo_url,
        description=body.description,
        enabled=body.enabled,
        sort_order=body.sort_order,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.manufacturer.create",
        resource_type="ai_manufacturer",
        resource_id=row.id,
        meta={"code": row.code, "name": row.name, "category": row.category},
    )
    return ResponseBase(code=200, msg="OK", data=AIManufacturerRead.model_validate(row))


@router.put(
    "/ai/admin/manufacturers/{manufacturer_id}",
    response_model=ResponseBase[AIManufacturerRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_update_manufacturer(
    request: Request,
    manufacturer_id: UUID,
    body: AIManufacturerUpdate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIManufacturerRead]:
    row = await ai_manufacturer_service.update(
        db=db,
        manufacturer_id=manufacturer_id,
        patch=body.model_dump(exclude_unset=True),
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.manufacturer.update",
        resource_type="ai_manufacturer",
        resource_id=row.id,
        meta={"code": row.code, "name": row.name, "category": row.category},
    )
    return ResponseBase(code=200, msg="OK", data=AIManufacturerRead.model_validate(row))


@router.delete(
    "/ai/admin/manufacturers/{manufacturer_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_delete_manufacturer(
    request: Request,
    manufacturer_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[dict]:
    await ai_manufacturer_service.delete(db=db, manufacturer_id=manufacturer_id)
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.manufacturer.delete",
        resource_type="ai_manufacturer",
        resource_id=manufacturer_id,
        meta={},
    )
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


# ==================== Model APIs ====================


@router.get(
    "/ai/admin/models",
    response_model=ResponseBase[list[AIModelWithManufacturerRead]],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_list_models(
    manufacturer_id: UUID | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AIModelWithManufacturerRead]]:
    rows = await ai_model_service.list(
        db=db,
        manufacturer_id=manufacturer_id,
        category=category,
        with_manufacturer=True,
    )
    return ResponseBase(
        code=200,
        msg="OK",
        data=[AIModelWithManufacturerRead.model_validate(r) for r in rows],
    )


@router.post(
    "/ai/admin/models",
    response_model=ResponseBase[AIModelRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_create_model(
    request: Request,
    body: AIModelCreate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelRead]:
    row = await ai_model_service.create(
        db=db,
        manufacturer_id=body.manufacturer_id,
        code=body.code,
        name=body.name,
        response_format=body.response_format,
        supports_image=body.supports_image,
        supports_think=body.supports_think,
        supports_tool=body.supports_tool,
        context_window=body.context_window,
        model_metadata=body.model_metadata,
        enabled=body.enabled,
        sort_order=body.sort_order,
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model.create",
        resource_type="ai_model",
        resource_id=row.id,
        meta={"code": row.code, "name": row.name, "manufacturer_id": str(row.manufacturer_id)},
    )
    return ResponseBase(code=200, msg="OK", data=AIModelRead.model_validate(row))


@router.put(
    "/ai/admin/models/{model_id}",
    response_model=ResponseBase[AIModelRead],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_update_model(
    request: Request,
    model_id: UUID,
    body: AIModelUpdate,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[AIModelRead]:
    row = await ai_model_service.update(
        db=db,
        model_id=model_id,
        patch=body.model_dump(exclude_unset=True),
    )
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model.update",
        resource_type="ai_model",
        resource_id=row.id,
        meta={"code": row.code, "name": row.name},
    )
    return ResponseBase(code=200, msg="OK", data=AIModelRead.model_validate(row))


@router.delete(
    "/ai/admin/models/{model_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.ai_models"]))],
)
async def admin_delete_model(
    request: Request,
    model_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.ai_models"])),
) -> ResponseBase[dict]:
    await ai_model_service.delete(db=db, model_id=model_id)
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="ai.model.delete",
        resource_type="ai_model",
        resource_id=model_id,
        meta={},
    )
    return ResponseBase(code=200, msg="OK", data={"deleted": True})


# ==================== Public Catalog API ====================


@router.get(
    "/ai/catalog",
    response_model=ResponseBase[list[AICatalogItem]],
)
async def get_catalog(
    category: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[AICatalogItem]]:
    manufacturers = await ai_manufacturer_service.list(db=db, category=category, enabled_only=True)
    manufacturer_map = {m.id: m for m in manufacturers}

    models = await ai_model_service.list(
        db=db,
        category=category,
        enabled_only=True,
        with_manufacturer=True,
    )

    items = []
    for m in models:
        manu = m.manufacturer
        if manu is None:
            continue
        items.append(
            AICatalogItem(
                manufacturer_code=manu.code,
                manufacturer_name=manu.name,
                model_code=m.code,
                model_name=m.name,
                category=manu.category,
                response_format=m.response_format,
                model_capabilities=m.model_capabilities or {},
                supports_image=m.supports_image,
                supports_think=m.supports_think,
                supports_tool=m.supports_tool,
                default_base_url=manu.default_base_url,
            )
        )

    return ResponseBase(code=200, msg="OK", data=items)
@router.get(
    "/ai/catalog/models",
    response_model=ResponseBase[list[ManufacturerWithModels]],
)
async def get_models_with_capabilities(
    category: str = "image",
    enabled_only: bool = True,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[list[ManufacturerWithModels]]:
    """查询指定类别的模型及其能力信息，按厂商分组返回。"""
    rows = await ai_model_service.list_with_capabilities(
        db=db, category=category, enabled_only=enabled_only,
    )
    data = [ManufacturerWithModels(**r) for r in rows]
    return ResponseBase(code=200, msg="OK", data=data)


@router.get("/ai/catalog/configs")
async def get_available_configs(
    category: str = "text",
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[list[dict]]:
    rows = (
        await db.execute(
            select(AIModelConfig)
            .where(AIModelConfig.enabled == True)
            .where(AIModelConfig.category == category)
            .order_by(AIModelConfig.sort_order.desc())
        )
    ).scalars().all()
    
    data = []
    for r in rows:
        data.append({
            "id": str(r.id),
            "name": f"{r.manufacturer}/{r.model}" if r.manufacturer else r.model,
            "model": r.model,
        })
    return ResponseBase(code=200, msg="OK", data=data)
