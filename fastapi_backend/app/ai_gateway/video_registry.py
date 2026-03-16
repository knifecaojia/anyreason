"""
Hardcoded video model registry.

Each video vendor/model has a VideoModelSpec declaring its capabilities,
supported modes, durations, aspect ratios, etc.  The registry replaces
database-driven model_capabilities for video models (see ADR-0003 note
in docs/plans/2026-03-06-video-model-refactoring.md §2.1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# VideoMode enum
# ---------------------------------------------------------------------------

class VideoMode(str, Enum):
    TEXT2VIDEO = "text2video"
    IMAGE2VIDEO = "image2video"
    START_END = "start_end"
    REFERENCE = "reference"
    MULTI_FRAME = "multi_frame"


# ---------------------------------------------------------------------------
# VideoModelSpec dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class VideoModelSpec:
    """Immutable capability declaration for a single video model."""

    code: str
    display_name: str
    manufacturer: str
    modes: list[VideoMode]
    durations: list[int]                             # discrete duration options (e.g. [5])
    aspect_ratios: list[str]
    resolutions: list[str] | None = None
    duration_range: tuple[int, int] | None = None    # continuous range (min, max) — takes priority over durations
    max_ref_images: int = 0
    max_frames: int = 0
    supports_enhance: bool = False
    supports_off_peak: bool = False
    style_options: list[str] | None = None
    extra: dict[str, Any] = field(default_factory=dict)


# ===== Vidu common constants =====

VIDU_COMMON_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"]

# Per-model mode lists based on official Vidu model map
# https://platform.vidu.cn/docs/model-map

# Q3: text2video ✔ | image2video ✔ | start_end ✔ | reference ✘ | multi_frame ✘(not listed)
VIDU_Q3_MODES = [VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO, VideoMode.START_END]
# Q2-pro-fast / Q2-turbo: text2video ✘ | image2video ✔ | start_end ✔ | reference ✘
VIDU_Q2_FAST_MODES = [VideoMode.IMAGE2VIDEO, VideoMode.START_END]
# Q2-pro: text2video ✘ | image2video ✔ | start_end ✔ | reference ✔
VIDU_Q2_PRO_MODES = [VideoMode.IMAGE2VIDEO, VideoMode.START_END, VideoMode.REFERENCE]
# Q2: text2video ✔ | image2video ✔ | start_end ✔ | reference ✔
VIDU_Q2_MODES = [VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO, VideoMode.START_END, VideoMode.REFERENCE]

# ===== Vidu models =====

VIDU_Q3_PRO = VideoModelSpec(
    code="viduq3-pro",
    display_name="Vidu Q3 Pro",
    manufacturer="vidu",
    modes=list(VIDU_Q3_MODES),
    durations=[],
    duration_range=(1, 16),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["540p", "720p", "1080p"],
    max_ref_images=0,
    max_frames=0,
    supports_enhance=True,
    supports_off_peak=True,
    style_options=["general", "anime"],
)

VIDU_Q3_TURBO = VideoModelSpec(
    code="viduq3-turbo",
    display_name="Vidu Q3 Turbo",
    manufacturer="vidu",
    modes=list(VIDU_Q3_MODES),
    durations=[],
    duration_range=(1, 16),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["540p", "720p", "1080p"],
    max_ref_images=0,
    max_frames=0,
    supports_enhance=True,
    supports_off_peak=True,
    style_options=["general", "anime"],
)

VIDU_Q2_PRO_FAST = VideoModelSpec(
    code="viduq2-pro-fast",
    display_name="Vidu Q2 Pro Fast",
    manufacturer="vidu",
    modes=list(VIDU_Q2_FAST_MODES),
    durations=[],
    duration_range=(1, 10),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["720p", "1080p"],
    max_ref_images=0,
    max_frames=0,
    supports_enhance=True,
    style_options=["general", "anime"],
)

VIDU_Q2_TURBO = VideoModelSpec(
    code="viduq2-turbo",
    display_name="Vidu Q2 Turbo",
    manufacturer="vidu",
    modes=list(VIDU_Q2_FAST_MODES),
    durations=[],
    duration_range=(1, 10),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["540p", "720p", "1080p"],
    max_ref_images=0,
    max_frames=0,
    supports_enhance=False,
    style_options=["general", "anime"],
)

VIDU_Q2_PRO = VideoModelSpec(
    code="viduq2-pro",
    display_name="Vidu Q2 Pro",
    manufacturer="vidu",
    modes=list(VIDU_Q2_PRO_MODES),
    durations=[],
    duration_range=(1, 10),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["540p", "720p", "1080p"],
    max_ref_images=3,
    max_frames=0,
    supports_enhance=True,
    style_options=["general", "anime"],
)

VIDU_Q2 = VideoModelSpec(
    code="viduq2",
    display_name="Vidu Q2",
    manufacturer="vidu",
    modes=list(VIDU_Q2_MODES),
    durations=[],
    duration_range=(1, 10),
    aspect_ratios=list(VIDU_COMMON_RATIOS),
    resolutions=["540p", "720p", "1080p"],
    max_ref_images=3,
    max_frames=0,
    supports_enhance=False,
    style_options=["general", "anime"],
)

# ===== Kling models (capability declaration only, provider unchanged) =====

KLING_V1 = VideoModelSpec(
    code="kling-v1",
    display_name="Kling V1",
    manufacturer="kling_video",
    modes=[VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO],
    durations=[5, 10],
    aspect_ratios=["16:9", "9:16", "1:1"],
    max_ref_images=0,
    max_frames=0,
)

KLING_V1_5 = VideoModelSpec(
    code="kling-v1-5",
    display_name="Kling V1.5",
    manufacturer="kling_video",
    modes=[VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO, VideoMode.START_END],
    durations=[5, 10],
    aspect_ratios=["16:9", "9:16", "1:1"],
    max_ref_images=0,
    max_frames=0,
)

# ===== Volcengine models (capability declaration only, provider unchanged) =====

VOLCENGINE_SEEDANCE = VideoModelSpec(
    code="seedance-2.0-lite",
    display_name="Seedance 2.0 Lite",
    manufacturer="volcengine_video",
    modes=[VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO],
    durations=[5],
    aspect_ratios=["16:9", "9:16", "1:1"],
    max_ref_images=0,
    max_frames=0,
)


# ===== Global registry =====

VIDEO_MODEL_REGISTRY: dict[str, VideoModelSpec] = {}


def _register(*specs: VideoModelSpec) -> None:
    for s in specs:
        key = f"{s.manufacturer}/{s.code}"
        VIDEO_MODEL_REGISTRY[key] = s


_register(
    # Vidu
    VIDU_Q3_PRO,
    VIDU_Q3_TURBO,
    VIDU_Q2_PRO_FAST,
    VIDU_Q2_TURBO,
    VIDU_Q2_PRO,
    VIDU_Q2,
    # Kling
    KLING_V1,
    KLING_V1_5,
    # Volcengine
    VOLCENGINE_SEEDANCE,
)


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def get_video_model_spec(manufacturer: str, model: str) -> VideoModelSpec | None:
    """Look up a model spec by manufacturer code + model code."""
    return VIDEO_MODEL_REGISTRY.get(f"{manufacturer}/{model}")


def list_video_model_specs() -> list[VideoModelSpec]:
    """Return all registered video model specs."""
    return list(VIDEO_MODEL_REGISTRY.values())


# ---------------------------------------------------------------------------
# Compatibility: convert VideoModelSpec → ModelCapabilities dict
# ---------------------------------------------------------------------------

_MODE_TO_INPUT_MODE: dict[VideoMode, str] = {
    VideoMode.TEXT2VIDEO: "text_to_video",
    VideoMode.IMAGE2VIDEO: "first_frame",
    VideoMode.START_END: "first_last_frame",
    VideoMode.REFERENCE: "reference_to_video",
    VideoMode.MULTI_FRAME: "multi_frame",
}


def to_model_capabilities(spec: VideoModelSpec) -> dict[str, Any]:
    """Convert a hardcoded VideoModelSpec into the ModelCapabilities dict
    format consumed by the frontend CapabilityParams / ModelSelector."""
    caps: dict[str, Any] = {
        "aspect_ratios": list(spec.aspect_ratios),
    }
    # Prefer continuous duration_range over discrete duration_options
    if spec.duration_range:
        caps["duration_range"] = {"min": spec.duration_range[0], "max": spec.duration_range[1]}
    elif spec.durations:
        caps["duration_options"] = list(spec.durations)
    if spec.resolutions:
        caps["resolutions"] = list(spec.resolutions)
    if spec.modes:
        caps["input_modes"] = [
            _MODE_TO_INPUT_MODE[m] for m in spec.modes if m in _MODE_TO_INPUT_MODE
        ]
    if spec.max_ref_images:
        caps["max_reference_images"] = spec.max_ref_images
    if spec.max_frames:
        caps["max_frames"] = spec.max_frames
    if spec.style_options:
        caps["style_options"] = list(spec.style_options)
    if spec.supports_off_peak:
        caps["supports_off_peak"] = True
    caps["supports_negative_prompt"] = True
    return caps


def spec_to_api_dict(spec: VideoModelSpec) -> dict[str, Any]:
    """Serialize a VideoModelSpec for the /api/ai/video-models endpoint."""
    d: dict[str, Any] = {
        "manufacturer": spec.manufacturer,
        "code": spec.code,
        "display_name": spec.display_name,
        "modes": [m.value for m in spec.modes],
        "durations": list(spec.durations) if spec.durations else None,
        "duration_range": {"min": spec.duration_range[0], "max": spec.duration_range[1]} if spec.duration_range else None,
        "aspect_ratios": list(spec.aspect_ratios),
        "resolutions": list(spec.resolutions) if spec.resolutions else None,
        "max_ref_images": spec.max_ref_images,
        "max_frames": spec.max_frames,
        "supports_enhance": spec.supports_enhance,
        "supports_off_peak": spec.supports_off_peak,
        "style_options": list(spec.style_options) if spec.style_options else None,
        "model_capabilities": to_model_capabilities(spec),
    }
    return d
