from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.ai_tools.chatbox_tools import (
    asset_create,
    asset_deduplicator_preview,
    episode_asset_bind,
    episode_save,
    extract_characters,
    extract_episode_characters,
    extract_locations,
    extract_props,
    extract_vfx,
    script_segmenter,
)


CHATBOX_TOOL_FUNCTIONS: tuple[Callable[..., Any], ...] = (
    script_segmenter,
    extract_characters,
    extract_episode_characters,
    extract_props,
    extract_locations,
    extract_vfx,
    asset_deduplicator_preview,
    asset_create,
    episode_asset_bind,
    episode_save,
)

CHATBOX_WRITE_TOOL_IDS: frozenset[str] = frozenset(
    {
        "asset_create",
        "asset_bind",
        "episode_save",
    }
)
