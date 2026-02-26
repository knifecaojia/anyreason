"""
导出 AI 配置（含明文 API key），用于跨环境同步。

与 export_ai_config.py 不同，此脚本会解密 API key 为明文导出，
导入端再用目标环境的 ACCESS_SECRET_KEY 重新加密。

用法：
    cd fastapi_backend
    uv run python scripts/export_ai_config_plaintext.py
    uv run python scripts/export_ai_config_plaintext.py -o data/ai_config_sync.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.config import settings
from app.crypto import build_fernet
from app.database import async_session_maker
from app.models import AIManufacturer, AIModel, AIModelConfig, AIModelBinding


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
        print(f"  ⚠ 解密失败: {e}")
        return None


async def export_config(output_path: str) -> None:
    async with async_session_maker() as db:
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
            plain_key = _decrypt_api_key(r.encrypted_api_key)
            configs.append({
                "id": str(r.id),
                "category": r.category,
                "manufacturer": r.manufacturer,
                "model": r.model,
                "base_url": r.base_url,
                "api_key": plain_key,  # 明文！
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

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, default=_serialize, ensure_ascii=False), encoding="utf-8")
    print(f"✅ 导出完成（明文模式）: {out.resolve()}")
    print(f"   厂商: {len(manufacturers)}, 模型: {len(models)}, 配置: {len(configs)}, 绑定: {len(bindings)}")
    print(f"   ⚠️  文件含明文 API key，请勿提交到版本控制！")


def main():
    parser = argparse.ArgumentParser(description="导出 AI 配置（明文 API key）")
    parser.add_argument("-o", "--output", default="data/ai_config_sync.json", help="输出文件路径")
    args = parser.parse_args()
    asyncio.run(export_config(args.output))


if __name__ == "__main__":
    main()
