"""M5.2: FCP XML (Final Cut Pro XML) timeline generator.

Generates FCPXML 1.11 from a list of canvas nodes that have storyboard
references, ordering clips by shot_number within scene groups.

Usage:
    xml_str = build_fcpxml(clips, project_name="My Canvas")
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class FcpClip:
    """One clip in the FCP timeline."""
    name: str
    file_ref: str  # MinIO key or VFS node id — external reference
    duration_seconds: float = 5.0
    shot_code: str = ""
    scene_code: str = ""
    shot_number: int = 0
    scene_number: int = 0
    markers: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# FCPXML constants
# ---------------------------------------------------------------------------

_FRAME_RATE_NUM = 30000
_FRAME_RATE_DEN = 1001  # 29.97 fps NTSC
_TIMEBASE = f"{_FRAME_RATE_NUM}/{_FRAME_RATE_DEN}s"


def _rational(seconds: float) -> str:
    """Convert seconds to FCPXML rational time (frames / timebase)."""
    frames = round(seconds * _FRAME_RATE_NUM / _FRAME_RATE_DEN)
    return f"{frames * _FRAME_RATE_DEN}/{_FRAME_RATE_NUM}s"


def build_fcpxml(
    clips: list[FcpClip],
    *,
    project_name: str = "Canvas Export",
    width: int = 1920,
    height: int = 1080,
) -> str:
    """Build FCPXML 1.11 string from a list of clips.

    Clips are sorted by (scene_number, shot_number) to produce a sequential
    timeline matching the storyboard order.
    """
    sorted_clips = sorted(clips, key=lambda c: (c.scene_number, c.shot_number))

    # Root <fcpxml>
    root = ET.Element("fcpxml", version="1.11")

    # <resources>
    resources = ET.SubElement(root, "resources")
    fmt = ET.SubElement(resources, "format", id="r1", name="FFVideoFormat1080p2997")
    fmt.set("frameDuration", _TIMEBASE)
    fmt.set("width", str(width))
    fmt.set("height", str(height))

    # Create asset entries for each clip
    for i, clip in enumerate(sorted_clips):
        asset_id = f"asset_{i}"
        asset = ET.SubElement(resources, "asset", id=asset_id, name=clip.name)
        asset.set("src", clip.file_ref)
        asset.set("format", "r1")
        asset.set("duration", _rational(clip.duration_seconds))
        asset.set("hasVideo", "1")

    # <library> → <event> → <project> → <sequence> → <spine>
    library = ET.SubElement(root, "library")
    event = ET.SubElement(library, "event", name=project_name)
    project = ET.SubElement(event, "project", name=project_name)

    total_dur = sum(c.duration_seconds for c in sorted_clips) or 1.0
    sequence = ET.SubElement(project, "sequence", format="r1")
    sequence.set("duration", _rational(total_dur))
    sequence.set("tcStart", "0/1s")
    sequence.set("tcFormat", "NDF")

    spine = ET.SubElement(sequence, "spine")

    # Add clips to spine in order
    offset_seconds = 0.0
    for i, clip in enumerate(sorted_clips):
        asset_id = f"asset_{i}"
        clip_el = ET.SubElement(spine, "asset-clip")
        clip_el.set("ref", asset_id)
        clip_el.set("name", clip.name)
        clip_el.set("offset", _rational(offset_seconds))
        clip_el.set("duration", _rational(clip.duration_seconds))
        clip_el.set("format", "r1")

        # Add markers for metadata
        for marker_text in clip.markers:
            marker = ET.SubElement(clip_el, "marker")
            marker.set("start", _rational(0))
            marker.set("duration", _rational(0))
            marker.set("value", marker_text)

        # Add note with shot/scene code
        if clip.shot_code or clip.scene_code:
            note = ET.SubElement(clip_el, "note")
            note.text = f"{clip.scene_code or ''} / {clip.shot_code or ''}".strip(" /")

        offset_seconds += clip.duration_seconds

    # Serialize
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")

    # FCPXML requires specific DOCTYPE — write manually
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE fcpxml>',
    ]
    xml_str = ET.tostring(root, encoding="unicode", xml_declaration=False)
    lines.append(xml_str)
    return "\n".join(lines)
