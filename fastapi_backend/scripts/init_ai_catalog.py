"""
初始化 AI 厂商和模型目录数据

运行方式:
    cd fastapi_backend
    uv run python scripts/init_ai_catalog.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.services.ai_catalog_service import ai_manufacturer_service, ai_model_service


TEXT_MANUFACTURERS = [
    {"code": "deepseek", "name": "DeepSeek", "provider_class": "OpenAITextProvider", "default_base_url": "https://api.deepseek.com/v1", "sort_order": 1},
    {"code": "doubao", "name": "豆包/火山引擎", "provider_class": "OpenAITextProvider", "default_base_url": "https://ark.cn-beijing.volces.com/api/v3", "sort_order": 2},
    {"code": "zhipu", "name": "智谱AI (GLM)", "provider_class": "OpenAITextProvider", "default_base_url": "https://open.bigmodel.cn/api/paas/v4", "sort_order": 3},
    {"code": "qwen", "name": "通义千问", "provider_class": "OpenAITextProvider", "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "sort_order": 4},
    {"code": "openai", "name": "OpenAI", "provider_class": "OpenAITextProvider", "default_base_url": "https://api.openai.com/v1", "sort_order": 5},
    {"code": "gemini", "name": "Google Gemini", "provider_class": "OpenAITextProvider", "default_base_url": "https://generativelanguage.googleapis.com/v1beta", "sort_order": 6},
    {"code": "anthropic", "name": "Anthropic (Claude)", "provider_class": "OpenAITextProvider", "default_base_url": "https://api.anthropic.com/v1", "sort_order": 7},
    {"code": "xai", "name": "xAI (Grok)", "provider_class": "OpenAITextProvider", "default_base_url": "https://api.x.ai/v1", "sort_order": 8},
    {"code": "other", "name": "其他/自定义", "provider_class": "OpenAITextProvider", "default_base_url": "", "sort_order": 99},
]

TEXT_MODELS = [
    {"manufacturer_code": "deepseek", "code": "deepseek-chat", "name": "DeepSeek Chat", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "deepseek", "code": "deepseek-reasoner", "name": "DeepSeek Reasoner", "response_format": "schema", "supports_image": False, "supports_think": True, "supports_tool": True},

    {"manufacturer_code": "doubao", "code": "doubao-seed-1-8-251228", "name": "Doubao Seed 1.8", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "doubao", "code": "doubao-seed-1-6-251015", "name": "Doubao Seed 1.6", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "doubao", "code": "doubao-seed-1-6-lite-251015", "name": "Doubao Seed 1.6 Lite", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "doubao", "code": "doubao-seed-1-6-flash-250828", "name": "Doubao Seed 1.6 Flash", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},

    {"manufacturer_code": "zhipu", "code": "glm-4.7", "name": "GLM-4.7", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.7-flashx", "name": "GLM-4.7 FlashX", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.6", "name": "GLM-4.6", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.5-air", "name": "GLM-4.5 Air", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.5-airx", "name": "GLM-4.5 AirX", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4-long", "name": "GLM-4 Long", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4-flashx-250414", "name": "GLM-4 FlashX", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.7-flash", "name": "GLM-4.7 Flash", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.5-flash", "name": "GLM-4.5 Flash", "response_format": "object", "supports_image": False, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4-flash-250414", "name": "GLM-4 Flash", "response_format": "object", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "zhipu", "code": "glm-4.6v", "name": "GLM-4.6V (Vision)", "response_format": "object", "supports_image": True, "supports_think": True, "supports_tool": True},

    {"manufacturer_code": "qwen", "code": "qwen-vl-max", "name": "Qwen VL Max", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "qwen", "code": "qwen-plus-latest", "name": "Qwen Plus", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "qwen", "code": "qwen-max", "name": "Qwen Max", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "qwen", "code": "qwen2.5-72b-instruct", "name": "Qwen2.5 72B", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "qwen", "code": "qwen2.5-14b-instruct-1m", "name": "Qwen2.5 14B 1M", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "qwen", "code": "qwen2.5-vl-72b-instruct", "name": "Qwen2.5 VL 72B", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},

    {"manufacturer_code": "openai", "code": "gpt-4o", "name": "GPT-4o", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "openai", "code": "gpt-4o-mini", "name": "GPT-4o Mini", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "openai", "code": "gpt-4.1", "name": "GPT-4.1", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "openai", "code": "gpt-5.1", "name": "GPT-5.1", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "openai", "code": "gpt-5.2", "name": "GPT-5.2", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},

    {"manufacturer_code": "gemini", "code": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "gemini", "code": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "response_format": "schema", "supports_image": True, "supports_think": True, "supports_tool": True},
    {"manufacturer_code": "gemini", "code": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "gemini", "code": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash Lite", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "gemini", "code": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "gemini", "code": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},

    {"manufacturer_code": "anthropic", "code": "claude-opus-4-5", "name": "Claude Opus 4.5", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-opus-4-1", "name": "Claude Opus 4.1", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-opus-4-0", "name": "Claude Opus 4.0", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-sonnet-4-0", "name": "Claude Sonnet 4.0", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-3-7-sonnet-latest", "name": "Claude 3.7 Sonnet", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "anthropic", "code": "claude-3-5-haiku-latest", "name": "Claude 3.5 Haiku", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},

    {"manufacturer_code": "xai", "code": "grok-3", "name": "Grok 3", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "xai", "code": "grok-4", "name": "Grok 4", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": True},
    {"manufacturer_code": "xai", "code": "grok-4.1", "name": "Grok 4.1", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},

    {"manufacturer_code": "other", "code": "gpt-4.1", "name": "GPT-4.1 (Custom)", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": True},
]

IMAGE_MANUFACTURERS = [
    {"code": "kling", "name": "可灵", "provider_class": "KlingImageProvider", "sort_order": 1},
    {"code": "gemini", "name": "Google Gemini", "provider_class": "GeminiImageProvider", "sort_order": 2},
    {"code": "openai", "name": "OpenAI", "provider_class": "OpenAIImageProvider", "sort_order": 3},
    {"code": "doubao", "name": "豆包/火山引擎", "provider_class": "OpenAIImageProvider", "sort_order": 4},
]

IMAGE_MODELS = [
    {"manufacturer_code": "kling", "code": "kling-image-o1", "name": "Kling Image O1", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "gemini", "code": "gemini-2.5-flash-image", "name": "Gemini 2.5 Flash Image", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "gemini", "code": "gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image Preview", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "doubao", "code": "doubao-seedream-4-5-251128", "name": "Doubao SeeDream 4.5", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "doubao", "code": "doubao-seedream-4-0-250828", "name": "Doubao SeeDream 4.0", "response_format": "schema", "supports_image": True, "supports_think": False, "supports_tool": False},
]

VIDEO_MANUFACTURERS = [
    {"code": "kling", "name": "可灵", "provider_class": "KlingVideoProvider", "sort_order": 1},
]

VIDEO_MODELS = [
    {"manufacturer_code": "kling", "code": "kling-v1", "name": "Kling V1 (STD)", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "kling", "code": "kling-v1-6", "name": "Kling V1.6 (PRO)", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "kling", "code": "kling-v2-5-turbo", "name": "Kling V2.5 Turbo (PRO)", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": False},
    {"manufacturer_code": "kling", "code": "kling-v2-6", "name": "Kling V2.6 (PRO)", "response_format": "schema", "supports_image": False, "supports_think": False, "supports_tool": False},
]


async def init_catalog(db: AsyncSession) -> None:
    print("=== 开始初始化 AI 厂商和模型目录 ===")

    for category, manufacturers, models in [
        ("text", TEXT_MANUFACTURERS, TEXT_MODELS),
        ("image", IMAGE_MANUFACTURERS, IMAGE_MODELS),
        ("video", VIDEO_MANUFACTURERS, VIDEO_MODELS),
    ]:
        print(f"\n--- 处理 {category} 类别 ---")

        manufacturer_id_map = {}
        for mfr in manufacturers:
            existing = await ai_manufacturer_service.get_by_code(db=db, code=mfr["code"], category=category)
            if existing:
                print(f"  厂商已存在: {mfr['code']} ({category})")
                manufacturer_id_map[mfr["code"]] = existing.id
                continue

            row = await ai_manufacturer_service.create(
                db=db,
                code=mfr["code"],
                name=mfr["name"],
                category=category,
                provider_class=mfr.get("provider_class"),
                default_base_url=mfr.get("default_base_url"),
                sort_order=mfr.get("sort_order", 0),
            )
            manufacturer_id_map[mfr["code"]] = row.id
            print(f"  创建厂商: {mfr['code']} ({category})")

        for mdl in models:
            mfr_code = mdl["manufacturer_code"]
            manufacturer_id = manufacturer_id_map.get(mfr_code)
            if not manufacturer_id:
                print(f"  警告: 找不到厂商 {mfr_code}，跳过模型 {mdl['code']}")
                continue

            existing = await ai_model_service.get_by_code(db=db, manufacturer_id=manufacturer_id, code=mdl["code"])
            if existing:
                print(f"    模型已存在: {mdl['code']}")
                continue

            await ai_model_service.create(
                db=db,
                manufacturer_id=manufacturer_id,
                code=mdl["code"],
                name=mdl["name"],
                response_format=mdl.get("response_format", "schema"),
                supports_image=mdl.get("supports_image", False),
                supports_think=mdl.get("supports_think", False),
                supports_tool=mdl.get("supports_tool", True),
            )
            print(f"    创建模型: {mdl['code']}")

    print("\n=== 初始化完成 ===")


async def main() -> None:
    async with async_session_maker() as db:
        await init_catalog(db)


if __name__ == "__main__":
    asyncio.run(main())
