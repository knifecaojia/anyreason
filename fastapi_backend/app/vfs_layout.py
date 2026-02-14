from __future__ import annotations

import re


EPISODES_FOLDER_NAME = "分集"
ASSETS_FOLDER_NAME = "资产"
BINDINGS_FOLDER_NAME = "绑定"

ASSET_TYPE_FOLDER_NAMES: dict[str, str] = {
    "character": "角色",
    "prop": "道具",
    "location": "地点",
    "vfx": "特效",
}


def safe_filename(value: str) -> str:
    name = (value or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"\\s+", "_", name)
    name = re.sub(r'[<>:"|?*]+', "_", name)
    name = name.strip("._-")
    return name or "untitled"


def episode_filename(*, episode_number: int, title: str | None) -> str:
    title_part = safe_filename(title or "")
    if title_part:
        return f"EP{int(episode_number):03d}_{title_part}.md"
    return f"EP{int(episode_number):03d}.md"


def asset_filename(*, asset_type: str, name: str, asset_id: str | None = None) -> str:
    base = safe_filename(name)
    if asset_id:
        return f"{asset_id}_{base}.json"
    return f"{asset_type}_{base}.json"


def bindings_filename(*, episode_number: int) -> str:
    return f"EP{int(episode_number):03d}_bindings.json"

