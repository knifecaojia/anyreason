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


# =====================================================================
# TEXT 厂商 & 模型
# =====================================================================

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

# =====================================================================
# IMAGE 厂商 & 模型
# =====================================================================

IMAGE_MANUFACTURERS = [
    {"code": "aliyun", "name": "阿里云", "provider_class": "AliyunMediaProvider", "default_base_url": "https://dashscope.aliyuncs.com/api/v1", "sort_order": 1},
    {"code": "volcengine", "name": "火山引擎", "provider_class": "VolcengineMediaProvider", "default_base_url": "https://ark.cn-beijing.volces.com/api/v3", "sort_order": 2},
    {"code": "gemini", "name": "Google Gemini", "provider_class": "GeminiMediaProvider", "sort_order": 3},
    {"code": "gemini_proxy", "name": "Gemini 中转", "provider_class": "GeminiProxyProvider", "sort_order": 4},
    {"code": "kling", "name": "可灵", "provider_class": "KlingImageProvider", "sort_order": 5},
    {"code": "openai", "name": "OpenAI", "provider_class": "OpenAIImageProvider", "sort_order": 6},
    {"code": "doubao", "name": "豆包/火山引擎", "provider_class": "OpenAIImageProvider", "sort_order": 7},
]

IMAGE_MODELS = [
    # --- 阿里云：千问文生图 ---
    {"manufacturer_code": "aliyun", "code": "qwen-image-max", "name": "千问文生图 Max", "category": "image", "model_capabilities": {
        "resolutions": ["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"],
        "aspect_ratios": ["16:9", "4:3", "1:1", "3:4", "9:16"],
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "text2image/image-synthesis",
    }},
    {"manufacturer_code": "aliyun", "code": "qwen-image-plus", "name": "千问文生图 Plus", "category": "image", "model_capabilities": {
        "resolutions": ["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"],
        "aspect_ratios": ["16:9", "4:3", "1:1", "3:4", "9:16"],
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "text2image/image-synthesis",
    }},
    # --- 阿里云：Z-Image ---
    {"manufacturer_code": "aliyun", "code": "z-image-turbo", "name": "Z-Image Turbo", "category": "image", "model_capabilities": {
        "pixel_range": {"min": 262144, "max": 4194304, "recommended_min": 1048576, "recommended_max": 2359296},
        "supports_prompt_extend": True, "supports_seed": True,
        "api_endpoint": "text2image/image-synthesis",
    }},
    # --- 阿里云：万向文生图 v2 ---
    {"manufacturer_code": "aliyun", "code": "wan2.6-t2i", "name": "万向文生图 V2 (2.6)", "category": "image", "model_capabilities": {
        "pixel_range": {"min": 1638400, "max": 2073600},
        "aspect_ratio_range": {"min": 0.25, "max": 4.0},
        "max_output_images": 4,
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "multimodal-generation/generation",
    }},
    {"manufacturer_code": "aliyun", "code": "wan2.5-t2i", "name": "万向文生图 V2 (2.5)", "category": "image", "model_capabilities": {
        "pixel_range": {"min": 1638400, "max": 2073600},
        "aspect_ratio_range": {"min": 0.25, "max": 4.0},
        "max_output_images": 4,
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "multimodal-generation/generation",
    }},
    # --- 火山引擎：SeedDream ---
    {"manufacturer_code": "volcengine", "code": "doubao-seedream-4-5", "name": "SeedDream 4.5", "category": "image", "model_capabilities": {
        "resolution_tiers": ["2K", "4K"],
        "resolution_examples": ["2048x2048", "2560x1440", "1728x2304"],
        "pixel_range": {"min": 3686400, "max": 16777216},
        "aspect_ratio_range": {"min": 0.0625, "max": 16.0},
        "supports_reference_image": True, "max_reference_images": 14,
        "special_features": ["text_rendering", "multi_subject_consistency", "material_realism"],
    }},
    {"manufacturer_code": "volcengine", "code": "doubao-seedream-5-0", "name": "SeedDream 5.0", "category": "image", "model_capabilities": {
        "resolution_tiers": ["2K", "4K"],
        "pixel_range": {"min": 3686400, "max": 16777216},
        "aspect_ratio_range": {"min": 0.0625, "max": 16.0},
        "supports_reference_image": True, "max_reference_images": 14,
        "special_features": ["text_rendering", "multi_subject_consistency", "web_search", "multi_turn_editing"],
    }},
    # --- Gemini 原生 ---
    {"manufacturer_code": "gemini", "code": "gemini-2.5-flash-image", "name": "Gemini 2.5 Flash Image", "category": "image", "model_capabilities": {
        "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolution_tiers": ["1K", "2K"],
        "supports_reference_image": True, "max_reference_images": 14,
        "supports_search_grounding": True, "supports_thinking": True,
    }},
    {"manufacturer_code": "gemini", "code": "gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image Preview", "category": "image", "model_capabilities": {
        "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolution_tiers": ["1K", "2K", "4K"],
        "supports_reference_image": True, "max_reference_images": 14,
        "supports_search_grounding": True, "supports_thinking": True,
    }},
    # --- Gemini 中转 ---
    {"manufacturer_code": "gemini_proxy", "code": "gemini-2.0-flash-exp-image-generation", "name": "Gemini 2.0 Flash (中转)", "category": "image", "model_capabilities": {
        "api_modes": ["native", "openai_compat"],
        "response_format": "base64",
        "supports_reference_image": True,
    }},
    # --- 可灵 (保留) ---
    {"manufacturer_code": "kling", "code": "kling-image-o1", "name": "Kling Image O1", "category": "image"},
    # --- 豆包旧版 (保留) ---
    {"manufacturer_code": "doubao", "code": "doubao-seedream-4-5-251128", "name": "Doubao SeeDream 4.5", "category": "image"},
    {"manufacturer_code": "doubao", "code": "doubao-seedream-4-0-250828", "name": "Doubao SeeDream 4.0", "category": "image"},
]

# =====================================================================
# VIDEO 厂商 & 模型
# =====================================================================

VIDEO_MANUFACTURERS = [
    {"code": "aliyun", "name": "阿里云", "provider_class": "AliyunMediaProvider", "default_base_url": "https://dashscope.aliyuncs.com/api/v1", "sort_order": 1},
    {"code": "volcengine_video", "name": "火山引擎", "provider_class": "VolcengineVideoProvider", "default_base_url": "https://ark.cn-beijing.volces.com/api/v3", "sort_order": 2},
    {"code": "kling", "name": "可灵", "provider_class": "KlingVideoProvider", "sort_order": 3},
]

VIDEO_MODELS = [
    # --- 阿里云：万向首帧模式 ---
    {"manufacturer_code": "aliyun", "code": "wan2.6-i2v", "name": "万向图生视频-首帧 (2.6)", "category": "video", "model_capabilities": {
        "input_modes": ["first_frame"],
        "resolution_tiers": {
            "480P": ["854x480", "480x854", "640x640"],
            "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
            "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"],
        },
        "duration_range": {"min": 2, "max": 15},
        "supports_audio_input": True, "supports_multi_shot": True, "supports_template": True,
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "image2video/video-synthesis",
    }},
    {"manufacturer_code": "aliyun", "code": "wan2.5-i2v", "name": "万向图生视频-首帧 (2.5)", "category": "video", "model_capabilities": {
        "input_modes": ["first_frame"],
        "resolution_tiers": {
            "480P": ["854x480", "480x854", "640x640"],
            "720P": ["1280x720", "720x1280", "960x960"],
        },
        "duration_options": [5, 10],
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "image2video/video-synthesis",
    }},
    # --- 阿里云：万向首尾帧模式 ---
    {"manufacturer_code": "aliyun", "code": "wan2.2-kf2v-flash", "name": "万向图生视频-首尾帧 Flash", "category": "video", "model_capabilities": {
        "input_modes": ["first_last_frame"],
        "resolution_tiers": {
            "480P": ["854x480", "480x854", "640x640"],
            "720P": ["1280x720", "720x1280", "960x960"],
            "1080P": ["1920x1080", "1080x1920", "1440x1440"],
        },
        "duration_options": [5],
        "supports_template": True, "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "image2video/video-synthesis",
    }},
    {"manufacturer_code": "aliyun", "code": "wanx2.1-kf2v-plus", "name": "万向图生视频-首尾帧 Plus", "category": "video", "model_capabilities": {
        "input_modes": ["first_last_frame"],
        "resolution_tiers": {"720P": ["1280x720", "720x1280", "960x960"]},
        "duration_options": [5],
        "supports_negative_prompt": True, "supports_prompt_extend": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "image2video/video-synthesis",
    }},
    # --- 阿里云：万向参考生视频 ---
    {"manufacturer_code": "aliyun", "code": "wan2.6-r2v", "name": "万向参考生视频 (2.6)", "category": "video", "model_capabilities": {
        "input_modes": ["reference_to_video"],
        "resolution_tiers": {
            "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
            "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"],
        },
        "duration_range": {"min": 2, "max": 10},
        "max_reference_images": 5, "max_reference_videos": 3,
        "supports_multi_shot": True, "supports_audio": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "video-generation/video-synthesis",
    }},
    {"manufacturer_code": "aliyun", "code": "wan2.6-r2v-flash", "name": "万向参考生视频 Flash (2.6)", "category": "video", "model_capabilities": {
        "input_modes": ["reference_to_video"],
        "resolution_tiers": {
            "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
            "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"],
        },
        "duration_range": {"min": 2, "max": 10},
        "max_reference_images": 5, "max_reference_videos": 3,
        "supports_multi_shot": True, "supports_audio": True,
        "supports_watermark": True, "supports_seed": True,
        "api_endpoint": "video-generation/video-synthesis",
    }},
    # --- 火山引擎：Seedance ---
    {"manufacturer_code": "volcengine_video", "code": "seedance-2-0", "name": "Seedance 2.0", "category": "video", "model_capabilities": {
        "resolution": "2K",
        "supports_multi_shot": True, "max_reference_images": 5,
        "supports_video_completion": True, "max_video_completion_duration": 15,
        "supports_lip_sync": True,
        "supported_languages": ["zh", "en", "es", "fr", "de", "ja", "ko", "pt"],
    }},
    # --- 可灵 (保留) ---
    {"manufacturer_code": "kling", "code": "kling-v1", "name": "Kling V1 (STD)", "category": "video"},
    {"manufacturer_code": "kling", "code": "kling-v1-6", "name": "Kling V1.6 (PRO)", "category": "video"},
    {"manufacturer_code": "kling", "code": "kling-v2-5-turbo", "name": "Kling V2.5 Turbo (PRO)", "category": "video"},
    {"manufacturer_code": "kling", "code": "kling-v2-6", "name": "Kling V2.6 (PRO)", "category": "video"},
]


# =====================================================================
# 初始化逻辑
# =====================================================================

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
                model_capabilities=mdl.get("model_capabilities", {}),
                category=mdl.get("category"),
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
