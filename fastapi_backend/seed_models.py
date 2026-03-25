import asyncio

from sqlalchemy import select
from app.database import async_session_maker
from app.models import AIModelConfig, AIModelBinding, AIManufacturer, AIModel

MANUFACTURER_LIST = [
    {
        "code": "deepseek",
        "name": "DeepSeek",
        "category": "text",
        "default_base_url": "https://api.deepseek.com",
    },
    {
        "code": "doubao",
        "name": "Doubao",
        "category": "text",
        "default_base_url": "https://ark.cn-beijing.volces.com/api/v3",
    },
    {
        "code": "zhipu",
        "name": "Zhipu AI",
        "category": "text",
        "default_base_url": "https://open.bigmodel.cn/api/paas/v4",
    },
    {
        "code": "qwen",
        "name": "Qwen",
        "category": "text",
        "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    {
        "code": "openai",
        "name": "OpenAI",
        "category": "text",
        "default_base_url": None,
    },
    {
        "code": "gemini",
        "name": "Google Gemini",
        "category": "text",
        "default_base_url": None,
    },
    {
        "code": "anthropic",
        "name": "Anthropic",
        "category": "text",
        "default_base_url": None,
    },
    {
        "code": "xai",
        "name": "xAI",
        "category": "text",
        "default_base_url": None,
    },
    {
        "code": "other",
        "name": "Other",
        "category": "text",
        "default_base_url": None,
    },
    {
        "code": "12ai",
        "name": "12AI Gateway",
        "category": "image",
        "default_base_url": "https://cdn.12ai.org",
    },
    {
        "code": "12ai",
        "name": "12AI Gateway",
        "category": "video",
        "default_base_url": "https://cdn.12ai.org",
    },
]

MODEL_LIST = [
    # DeepSeek
    {
        "manufacturer_code": "deepseek",
        "code": "deepseek-chat",
        "name": "DeepSeek Chat",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "deepseek",
        "code": "deepseek-reasoner",
        "name": "DeepSeek Reasoner",
        "responseFormat": "schema",
        "image": False,
        "think": True,
        "tool": True,
        "category": "text",
    },
    # 豆包
    {
        "manufacturer_code": "doubao",
        "code": "doubao-seed-1-8-251228",
        "name": "Doubao Seed 1.8 251228",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "doubao",
        "code": "doubao-seed-1-6-251015",
        "name": "Doubao Seed 1.6 251015",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "doubao",
        "code": "doubao-seed-1-6-lite-251015",
        "name": "Doubao Seed 1.6 Lite 251015",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "doubao",
        "code": "doubao-seed-1-6-flash-250828",
        "name": "Doubao Seed 1.6 Flash 250828",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    # GLM
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.7",
        "name": "GLM 4.7",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.7-flashx",
        "name": "GLM 4.7 FlashX",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.6",
        "name": "GLM 4.6",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.5-air",
        "name": "GLM 4.5 Air",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.5-airx",
        "name": "GLM 4.5 AirX",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4-long",
        "name": "GLM 4 Long",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4-flashx-250414",
        "name": "GLM 4 FlashX 250414",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.7-flash",
        "name": "GLM 4.7 Flash",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.5-flash",
        "name": "GLM 4.5 Flash",
        "responseFormat": "object",
        "image": False,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4-flash-250414",
        "name": "GLM 4 Flash 250414",
        "responseFormat": "object",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "zhipu",
        "code": "glm-4.6v",
        "name": "GLM 4.6v",
        "responseFormat": "object",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    # Qwen
    {
        "manufacturer_code": "qwen",
        "code": "qwen-vl-max",
        "name": "Qwen VL Max",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "qwen",
        "code": "qwen-plus-latest",
        "name": "Qwen Plus Latest",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "qwen",
        "code": "qwen-max",
        "name": "Qwen Max",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "qwen",
        "code": "qwen2.5-72b-instruct",
        "name": "Qwen 2.5 72B Instruct",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "qwen",
        "code": "qwen2.5-14b-instruct-1m",
        "name": "Qwen 2.5 14B Instruct 1M",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "qwen",
        "code": "qwen2.5-vl-72b-instruct",
        "name": "Qwen 2.5 VL 72B Instruct",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    # OpenAI
    {
        "manufacturer_code": "openai",
        "code": "gpt-4o",
        "name": "GPT-4o",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "openai",
        "code": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "openai",
        "code": "gpt-4.1",
        "name": "GPT-4.1",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "openai",
        "code": "gpt-5.1",
        "name": "GPT-5.1",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "openai",
        "code": "gpt-5.2",
        "name": "GPT-5.2",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    # Gemini
    {
        "manufacturer_code": "gemini",
        "code": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "gemini",
        "code": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "responseFormat": "schema",
        "image": True,
        "think": True,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "gemini",
        "code": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "gemini",
        "code": "gemini-2.0-flash-lite",
        "name": "Gemini 2.0 Flash Lite",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "gemini",
        "code": "gemini-1.5-pro",
        "name": "Gemini 1.5 Pro",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "gemini",
        "code": "gemini-1.5-flash",
        "name": "Gemini 1.5 Flash",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    # Anthropic (Claude)
    {
        "manufacturer_code": "anthropic",
        "code": "claude-opus-4-5",
        "name": "Claude Opus 4.5",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-haiku-4-5",
        "name": "Claude Haiku 4.5",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-sonnet-4-5",
        "name": "Claude Sonnet 4.5",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-opus-4-1",
        "name": "Claude Opus 4.1",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-opus-4-0",
        "name": "Claude Opus 4.0",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-sonnet-4-0",
        "name": "Claude Sonnet 4.0",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-3-7-sonnet-latest",
        "name": "Claude 3.7 Sonnet",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "anthropic",
        "code": "claude-3-5-haiku-latest",
        "name": "Claude 3.5 Haiku",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    # xai
    {
        "manufacturer_code": "xai",
        "code": "grok-3",
        "name": "Grok 3",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "xai",
        "code": "grok-4",
        "name": "Grok 4",
        "responseFormat": "schema",
        "image": False,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "xai",
        "code": "grok-4.1",
        "name": "Grok 4.1",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    # other
    {
        "manufacturer_code": "other",
        "code": "gpt-4.1",
        "name": "GPT 4.1",
        "responseFormat": "schema",
        "image": True,
        "think": False,
        "tool": True,
        "category": "text",
    },
    {
        "manufacturer_code": "12ai",
        "code": "nanobanana",
        "name": "Nano Banana",
        "responseFormat": "schema",
        "model_capabilities": {
            "input_modes": ["text_to_image", "image_to_image"],
            "supports_reference_image": True,
            "supports_edit": True,
        },
        "image": True,
        "think": False,
        "tool": False,
        "category": "image",
    },
    {
        "manufacturer_code": "12ai",
        "code": "sora-2",
        "name": "Sora 2",
        "responseFormat": "schema",
        "model_capabilities": {
            "input_modes": ["text_to_video", "image_to_video"],
            "duration_options": [5, 10, 15],
            "supports_audio": False,
        },
        "image": False,
        "think": False,
        "tool": False,
        "category": "video",
    },
    {
        "manufacturer_code": "12ai",
        "code": "veo-3.1",
        "name": "Veo 3.1",
        "responseFormat": "schema",
        "model_capabilities": {
            "input_modes": ["text_to_video", "image_to_video"],
            "duration_options": [5, 8],
            "supports_audio": True,
        },
        "image": False,
        "think": False,
        "tool": False,
        "category": "video",
    },
]


async def seed_models():
    async with async_session_maker() as session:
        # 1. Seed Manufacturers
        # Check existing manufacturers
        existing_manus = (await session.execute(select(AIManufacturer))).scalars().all()
        existing_manu_map = {(m.code, m.category): m for m in existing_manus}
        
        manu_count = 0
        for m_data in MANUFACTURER_LIST:
            key = (m_data["code"], m_data["category"])
            if key in existing_manu_map:
                continue
            
            manu = AIManufacturer(
                code=m_data["code"],
                name=m_data["name"],
                category=m_data["category"],
                default_base_url=m_data["default_base_url"],
                enabled=True,
                sort_order=0,
            )
            session.add(manu)
            manu_count += 1
        
        if manu_count > 0:
            await session.commit()
            print(f"Seeded {manu_count} new manufacturers.")
            # Refresh existing map
            existing_manus = (await session.execute(select(AIManufacturer))).scalars().all()
            existing_manu_map = {(m.code, m.category): m for m in existing_manus}

        # 2. Seed Models
        existing_models = (await session.execute(select(AIModel))).scalars().all()
        existing_model_map = {(m.manufacturer_id, m.code): m for m in existing_models}
        
        model_count = 0
        for m_data in MODEL_LIST:
            # Find manufacturer
            manu = existing_manu_map.get((m_data["manufacturer_code"], m_data["category"]))
            if not manu:
                print(f"Warning: Manufacturer {m_data['manufacturer_code']} not found for model {m_data['code']}")
                continue
                
            key = (manu.id, m_data["code"])
            if key in existing_model_map:
                continue
            
            model = AIModel(
                manufacturer_id=manu.id,
                code=m_data["code"],
                name=m_data["name"],
                response_format=m_data["responseFormat"],
                model_capabilities=m_data.get("model_capabilities") or {},
                supports_image=m_data["image"],
                supports_think=m_data["think"],
                supports_tool=m_data["tool"],
                enabled=True,
                sort_order=0,
            )
            session.add(model)
            model_count += 1
            
        await session.commit()
        print(f"Seeded {model_count} new models.")
        
        # 3. Seed Configs (Deprecated but kept for backward compat if needed, or remove if fully migrated)
        # It seems the system uses AIModelConfig for user/system configuration of these models.
        # We should create default AIModelConfigs for each manufacturer if they don't exist?
        # Actually, let's look at AIModelConfig table. It has manufacturer/model columns.
        # If the system relies on AIModelConfig for runtime, we need to populate it too.
        
        existing_configs = (await session.execute(select(AIModelConfig))).scalars().all()
        existing_config_map = {(c.manufacturer, c.model, c.category): c for c in existing_configs}

        config_count = 0
        for m_data in MODEL_LIST:
             # Find manufacturer to get base_url
            manu = existing_manu_map.get((m_data["manufacturer_code"], m_data["category"]))
            base_url = manu.default_base_url if manu else None
            
            key = (m_data["manufacturer_code"], m_data["code"], m_data["category"])
            if key in existing_config_map:
                continue

            config = AIModelConfig(
                category=m_data["category"],
                manufacturer=m_data["manufacturer_code"],
                model=m_data["code"],
                base_url=base_url,
                encrypted_api_key=None, 
                enabled=True,
                sort_order=0,
            )
            session.add(config)
            config_count += 1
            
        await session.commit()
        print(f"Seeded {config_count} new model configs.")

        # Ensure default binding for 'chatbox'
        chatbox_binding = (await session.execute(select(AIModelBinding).where(AIModelBinding.key == "chatbox"))).scalars().first()
        if not chatbox_binding:
            target_model_code = "gpt-4o"
            target_manu_code = "openai"
            
            # Find the config we just created or existed
            config_row = (await session.execute(
                select(AIModelConfig)
                .where(AIModelConfig.manufacturer == target_manu_code)
                .where(AIModelConfig.model == target_model_code)
                .where(AIModelConfig.category == "text")
            )).scalars().first()
            
            if config_row:
                binding = AIModelBinding(
                    key="chatbox",
                    category="text",
                    ai_model_config_id=config_row.id
                )
                session.add(binding)
                await session.commit()
                print("Created default 'chatbox' binding.")

if __name__ == "__main__":
    asyncio.run(seed_models())
