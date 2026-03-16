from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import build_fernet
from app.database import get_async_session
from app.models import AIManufacturer, AIModel, AIModelConfig, AIModelBinding
from app.schemas_response import ResponseBase
from app.users import current_active_superuser as current_superuser

router = APIRouter()


def _serialize(obj):
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def _decrypt_api_key(encrypted: bytes | None) -> str | None:
    if not encrypted:
        return None
    try:
        fernet = build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))
        return fernet.decrypt(encrypted).decode("utf-8")
    except Exception as e:
        # log error?
        return None


def _encrypt_api_key(plain: str | None) -> bytes | None:
    if not plain:
        return None
    fernet = build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))
    return fernet.encrypt(plain.encode("utf-8"))


@router.get("/ai/models/export", response_class=StreamingResponse)
async def export_ai_models(
    db: AsyncSession = Depends(get_async_session),
    user=Depends(current_superuser),
):
    """
    导出所有 AI 模型厂商、模型、配置和绑定关系。
    API Key 将被解密为明文导出。
    """
    # 1. Manufacturers
    rows = (await db.execute(
        select(AIManufacturer).order_by(AIManufacturer.category, AIManufacturer.sort_order)
    )).scalars().all()
    manufacturers = []
    for r in rows:
        manufacturers.append({
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "category": r.category,
            "provider_class": r.provider_class,
            "default_base_url": r.default_base_url,
            "logo_url": r.logo_url,
            "description": r.description,
            "enabled": r.enabled,
            "sort_order": r.sort_order,
        })

    # 2. Models
    rows = (await db.execute(
        select(AIModel).order_by(AIModel.manufacturer_id, AIModel.sort_order)
    )).scalars().all()
    models = []
    for r in rows:
        models.append({
            "id": str(r.id),
            "manufacturer_id": str(r.manufacturer_id),
            "code": r.code,
            "name": r.name,
            "category": r.category,
            "response_format": r.response_format,
            "model_capabilities": r.model_capabilities or {},
            "supports_image": r.supports_image,
            "supports_think": r.supports_think,
            "supports_tool": r.supports_tool,
            "context_window": r.context_window,
            "model_metadata": r.model_metadata or {},
            "enabled": r.enabled,
            "sort_order": r.sort_order,
        })

    # 3. Model Configs — 解密 API key 为明文
    rows = (await db.execute(
        select(AIModelConfig).order_by(AIModelConfig.category, AIModelConfig.sort_order)
    )).scalars().all()
    configs = []
    for r in rows:
        # 优先使用 plaintext_api_key，否则尝试解密 encrypted_api_key
        plain_key = r.plaintext_api_key
        if not plain_key and r.encrypted_api_key:
            plain_key = _decrypt_api_key(r.encrypted_api_key)
        configs.append({
            "id": str(r.id),
            "category": r.category,
            "manufacturer": r.manufacturer,
            "model": r.model,
            "base_url": r.base_url,
            "api_key": plain_key,  # 明文！
            "plaintext_api_key": r.plaintext_api_key,  # 原始明文key
            "api_keys_info": r.api_keys_info,  # 多Key配置
            "enabled": r.enabled,
            "sort_order": r.sort_order,
        })

    # 4. Model Bindings
    rows = (await db.execute(
        select(AIModelBinding).order_by(AIModelBinding.category, AIModelBinding.key)
    )).scalars().all()
    bindings = []
    for r in rows:
        bindings.append({
            "id": str(r.id),
            "key": r.key,
            "category": r.category,
            "ai_model_config_id": str(r.ai_model_config_id) if r.ai_model_config_id else None,
        })

    data = {
        "_meta": {
            "exported_at": datetime.now().isoformat(),
            "version": "1.1-plaintext",
            "note": "API key 为明文，导入时会用目标环境的 ACCESS_SECRET_KEY 重新加密。请勿将此文件提交到 git！",
        },
        "ai_manufacturers": manufacturers,
        "ai_models": models,
        "ai_model_configs": configs,
        "ai_model_bindings": bindings,
    }

    file_content = json.dumps(data, indent=2, default=_serialize, ensure_ascii=False)
    
    # Create a generator for StreamingResponse
    async def iterfile():
        yield file_content

    return StreamingResponse(
        iterfile(),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=ai_models_export_{datetime.now().strftime('%Y%m%d%H%M%S')}.json"}
    )


@router.post("/ai/models/import", response_model=ResponseBase[dict])
async def import_ai_models(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_session),
    user=Depends(current_superuser),
):
    """
    导入 AI 模型配置（upsert）。
    会自动处理去重：
    - 厂商按 (code, category)
    - 模型按 (manufacturer, code)
    - 配置按 (category, manufacturer, model)
    - 绑定按 (key, category)
    API Key 会使用当前环境的密钥重新加密。
    """
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")

    stats = {
        "manufacturers": {"created": 0, "updated": 0},
        "models": {"created": 0, "updated": 0},
        "configs": {"created": 0, "updated": 0},
        "bindings": {"created": 0, "updated": 0},
    }

    # 1. Manufacturers — upsert by (code, category)
    mfr_id_map: dict[str, UUID] = {}
    for item in data.get("ai_manufacturers", []):
        old_id = item["id"]
        existing = (await db.execute(
            select(AIManufacturer).where(
                AIManufacturer.code == item["code"],
                AIManufacturer.category == item["category"],
            )
        )).scalars().first()

        if existing:
            existing.name = item["name"]
            existing.provider_class = item.get("provider_class")
            existing.default_base_url = item.get("default_base_url")
            existing.logo_url = item.get("logo_url")
            existing.description = item.get("description")
            existing.enabled = item.get("enabled", True)
            existing.sort_order = item.get("sort_order", 0)
            mfr_id_map[old_id] = existing.id
            stats["manufacturers"]["updated"] += 1
        else:
            row = AIManufacturer(
                code=item["code"],
                name=item["name"],
                category=item["category"],
                provider_class=item.get("provider_class"),
                default_base_url=item.get("default_base_url"),
                logo_url=item.get("logo_url"),
                description=item.get("description"),
                enabled=item.get("enabled", True),
                sort_order=item.get("sort_order", 0),
            )
            db.add(row)
            await db.flush()
            mfr_id_map[old_id] = row.id
            stats["manufacturers"]["created"] += 1

    # 2. Models — upsert by (manufacturer_id, code)
    # We need to map old manufacturer_id to new manufacturer_id
    model_id_map: dict[str, UUID] = {}
    for item in data.get("ai_models", []):
        old_id = item["id"]
        # Find the new manufacturer ID
        new_mfr_id = mfr_id_map.get(item["manufacturer_id"])
        
        # Fallback: if not found in map (maybe pre-existing), try to look up by code if we can find the manufacturer code from the import data?
        # But the import data has manufacturer_id which is a UUID from the export.
        # If we can't find the manufacturer, we skip.
        if not new_mfr_id:
            # Try to find manufacturer by other means? No, just skip for safety.
            continue

        existing = (await db.execute(
            select(AIModel).where(
                AIModel.manufacturer_id == new_mfr_id,
                AIModel.code == item["code"],
            )
        )).scalars().first()

        if existing:
            existing.name = item["name"]
            existing.category = item.get("category")
            existing.response_format = item.get("response_format", "schema")
            existing.model_capabilities = item.get("model_capabilities", {})
            existing.supports_image = item.get("supports_image", False)
            existing.supports_think = item.get("supports_think", False)
            existing.supports_tool = item.get("supports_tool", True)
            existing.context_window = item.get("context_window")
            existing.model_metadata = item.get("model_metadata", {})
            existing.enabled = item.get("enabled", True)
            existing.sort_order = item.get("sort_order", 0)
            model_id_map[old_id] = existing.id
            stats["models"]["updated"] += 1
        else:
            row = AIModel(
                manufacturer_id=new_mfr_id,
                code=item["code"],
                name=item["name"],
                category=item.get("category"),
                response_format=item.get("response_format", "schema"),
                model_capabilities=item.get("model_capabilities", {}),
                supports_image=item.get("supports_image", False),
                supports_think=item.get("supports_think", False),
                supports_tool=item.get("supports_tool", True),
                context_window=item.get("context_window"),
                model_metadata=item.get("model_metadata", {}),
                enabled=item.get("enabled", True),
                sort_order=item.get("sort_order", 0),
            )
            db.add(row)
            await db.flush()
            model_id_map[old_id] = row.id
            stats["models"]["created"] += 1

    # 3. Model Configs — 用当前环境 key 加密明文 API key
    config_id_map: dict[str, UUID] = {}
    for item in data.get("ai_model_configs", []):
        old_id = item["id"]
        # 优先使用 api_key 字段，否则使用 plaintext_api_key
        plain_key = item.get("api_key") or item.get("plaintext_api_key")
        encrypted = _encrypt_api_key(plain_key) if plain_key else None
        # 导入多Key配置
        api_keys_info = item.get("api_keys_info")

        existing = (await db.execute(
            select(AIModelConfig).where(
                AIModelConfig.category == item["category"],
                AIModelConfig.manufacturer == item["manufacturer"],
                AIModelConfig.model == item["model"],
            )
        )).scalars().first()

        if existing:
            existing.base_url = item.get("base_url")
            if encrypted is not None:
                existing.plaintext_api_key = plain_key
            if api_keys_info is not None:
                existing.api_keys_info = api_keys_info
            existing.enabled = item.get("enabled", True)
            existing.sort_order = item.get("sort_order", 0)
            config_id_map[old_id] = existing.id
            stats["configs"]["updated"] += 1
        else:
            row = AIModelConfig(
                category=item["category"],
                manufacturer=item["manufacturer"],
                model=item["model"],
                base_url=item.get("base_url"),
                encrypted_api_key=encrypted,
                plaintext_api_key=plain_key if plain_key else None,
                api_keys_info=api_keys_info if api_keys_info else None,
                enabled=item.get("enabled", True),
                sort_order=item.get("sort_order", 0),
            )
            db.add(row)
            await db.flush()
            config_id_map[old_id] = row.id
            stats["configs"]["created"] += 1

    # 4. Model Bindings — upsert by (key, category)
    for item in data.get("ai_model_bindings", []):
        # Find new config ID
        new_config_id = config_id_map.get(item["ai_model_config_id"]) if item.get("ai_model_config_id") else None

        existing = (await db.execute(
            select(AIModelBinding).where(
                AIModelBinding.key == item["key"],
                AIModelBinding.category == item["category"],
            )
        )).scalars().first()

        if existing:
            existing.ai_model_config_id = new_config_id
            stats["bindings"]["updated"] += 1
        else:
            row = AIModelBinding(
                key=item["key"],
                category=item["category"],
                ai_model_config_id=new_config_id,
            )
            db.add(row)
            stats["bindings"]["created"] += 1

    await db.commit()

    return ResponseBase(code=200, msg="Import successful", data=stats)
