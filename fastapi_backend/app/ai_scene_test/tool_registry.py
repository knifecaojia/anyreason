from __future__ import annotations

from app.ai_scene_test.tools import (
    preview_extract_characters,
    preview_extract_locations,
    preview_extract_props,
    preview_extract_vfx,
    preview_image_prompt,
    preview_script_split,
    preview_storyboard_apply,
    preview_video_prompt,
)

TOOL_REGISTRY = {
    "preview_script_split": (preview_script_split, "分集/场次拆分预览", ["episode_expert"]),
    "preview_extract_characters": (preview_extract_characters, "角色提取预览", ["character_expert"]),
    "preview_extract_props": (preview_extract_props, "道具提取预览", ["prop_expert"]),
    "preview_extract_locations": (preview_extract_locations, "地点提取预览", ["scene_expert"]),
    "preview_extract_vfx": (preview_extract_vfx, "特效提取预览", ["vfx_expert"]),
    "preview_storyboard_apply": (preview_storyboard_apply, "分镜创建预览", ["storyboard_expert"]),
    "preview_image_prompt": (preview_image_prompt, "分镜生图提示词预览", ["image_prompt_expert"]),
    "preview_video_prompt": (preview_video_prompt, "分镜生视频提示词预览", ["video_prompt_expert"]),
}
