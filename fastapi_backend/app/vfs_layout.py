from __future__ import annotations

import re


EPISODES_FOLDER_NAME = "分集"
ASSETS_FOLDER_NAME = "资产"
BINDINGS_FOLDER_NAME = "绑定"
STORYBOARD_FOLDER_NAME = "故事板"

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


def asset_doc_filename(*, asset_type: str, name: str, asset_id: str | None = None) -> str:
    base = safe_filename(name)
    if asset_id:
        return f"{asset_id}_{base}.md"
    return f"{asset_type}_{base}.md"


def bindings_filename(*, episode_number: int) -> str:
    return f"EP{int(episode_number):03d}_bindings.json"


def variant_doc_filename(*, asset_name: str, variant_key: str) -> str:
    base = safe_filename(asset_name)
    key = safe_filename(variant_key)
    return f"{base}_variants_{key}.md"


def variant_folder_name(*, asset_name: str) -> str:
    return safe_filename(asset_name)


# ---------------------------------------------------------------------------
# M4.1: Canvas VFS layout
# ---------------------------------------------------------------------------

CANVAS_ROOT_FOLDER_NAME = "创作工坊"


def canvas_output_folder_name(*, canvas_id: str) -> str:
    """Folder name for a single canvas: ``/创作工坊/{canvas_id}/``."""
    return safe_filename(canvas_id)


def canvas_node_output_filename(
    *,
    frontend_node_id: str,
    version: int = 1,
    ext: str = "png",
) -> str:
    """Standardised filename: ``node_{frontend_node_id}_v{version}.{ext}``."""
    nid = safe_filename(frontend_node_id)
    clean_ext = (ext or "png").lstrip(".")
    return f"node_{nid}_v{version}.{clean_ext}"
