"""
从明文 JSON 备份导入 AI 配置（upsert），用目标环境的 ACCESS_SECRET_KEY 加密 API key。

配合 export_ai_config_plaintext.py 使用，解决跨环境密钥不一致问题。

用法：
    cd fastapi_backend
    uv run python scripts/import_ai_config_plaintext.py
    uv run python scripts/import_ai_config_plaintext.py -i data/ai_config_sync.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.config import settings
from app.crypto import build_fernet
from app.database import async_session_maker
from app.models import AIManufacturer, AIModel, AIModelConfig, AIModelBinding


def _encrypt_api_key(plain: str | None) -> bytes | None:
    if not plain:
        return None
    fernet = build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))
    return fernet.encrypt(plain.encode("utf-8"))


async def import_config(input_path: str) -> None:
    data = json.loads(Path(input_path).read_text(encoding="utf-8"))
    meta = data.get("_meta", {})
    print(f"📦 导入备份文件: {input_path}")
    print(f"   导出时间: {meta.get('exported_at', 'unknown')}")
    print(f"   使用当前环境 ACCESS_SECRET_KEY 加密 API key")

    async with async_session_maker() as db:
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
                print(f"  ↻ 厂商已更新: {item['code']} ({item['category']})")
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
                print(f"  + 厂商已创建: {item['code']} ({item['category']})")

        # 2. Models — upsert by (manufacturer_id, code)
        model_id_map: dict[str, UUID] = {}
        for item in data.get("ai_models", []):
            old_id = item["id"]
            new_mfr_id = mfr_id_map.get(item["manufacturer_id"])
            if not new_mfr_id:
                print(f"  ⚠ 跳过模型 {item['code']}: 找不到厂商 {item['manufacturer_id']}")
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
                print(f"    ↻ 模型已更新: {item['code']}")
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
                print(f"    + 模型已创建: {item['code']}")

        # 3. Model Configs — 用当前环境 key 加密明文 API key
        config_id_map: dict[str, UUID] = {}
        for item in data.get("ai_model_configs", []):
            old_id = item["id"]
            # 支持两种格式：明文 api_key 或加密 encrypted_api_key
            plain_key = item.get("api_key")
            encrypted = _encrypt_api_key(plain_key) if plain_key else None

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
                    existing.encrypted_api_key = encrypted
                existing.enabled = item.get("enabled", True)
                existing.sort_order = item.get("sort_order", 0)
                config_id_map[old_id] = existing.id
                key_status = "✓ key已更新" if encrypted else "⚠ 无key"
                print(f"  ↻ 配置已更新: {item['manufacturer']}/{item['model']} ({key_status})")
            else:
                row = AIModelConfig(
                    category=item["category"],
                    manufacturer=item["manufacturer"],
                    model=item["model"],
                    base_url=item.get("base_url"),
                    encrypted_api_key=encrypted,
                    enabled=item.get("enabled", True),
                    sort_order=item.get("sort_order", 0),
                )
                db.add(row)
                await db.flush()
                config_id_map[old_id] = row.id
                key_status = "✓ key已设置" if encrypted else "⚠ 无key"
                print(f"  + 配置已创建: {item['manufacturer']}/{item['model']} ({key_status})")

        # 4. Model Bindings — upsert by (key, category)
        for item in data.get("ai_model_bindings", []):
            new_config_id = config_id_map.get(item["ai_model_config_id"]) if item.get("ai_model_config_id") else None

            existing = (await db.execute(
                select(AIModelBinding).where(
                    AIModelBinding.key == item["key"],
                    AIModelBinding.category == item["category"],
                )
            )).scalars().first()

            if existing:
                existing.ai_model_config_id = new_config_id
                print(f"  ↻ 绑定已更新: {item['key']} ({item['category']})")
            else:
                row = AIModelBinding(
                    key=item["key"],
                    category=item["category"],
                    ai_model_config_id=new_config_id,
                )
                db.add(row)
                print(f"  + 绑定已创建: {item['key']} ({item['category']})")

        await db.commit()

    print("\n✅ 导入完成（API key 已用当前环境密钥加密）")


def main():
    parser = argparse.ArgumentParser(description="导入 AI 配置（明文 API key 模式）")
    parser.add_argument("-i", "--input", default="data/ai_config_sync.json", help="输入文件路径")
    args = parser.parse_args()
    asyncio.run(import_config(args.input))


if __name__ == "__main__":
    main()
