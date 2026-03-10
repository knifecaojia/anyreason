"""
Video request parameter validation against the hardcoded model registry.

Called from ai_gateway_service.generate_media() and from the admin
test-video endpoint to validate param_json before reaching the provider.
"""
from __future__ import annotations

from typing import Any

import logging

from app.ai_gateway.video_registry import VideoMode, VideoModelSpec
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


def validate_video_request(
    spec: VideoModelSpec,
    param_json: dict[str, Any],
) -> dict[str, Any]:
    """Validate and normalise *param_json* against *spec*.

    Returns a cleaned copy of param_json ready for the provider.
    Raises ``AppError(400)`` on constraint violations.
    """
    images: list[str] = param_json.get("image_data_urls") or []
    img_count = len(images)

    mode_str = param_json.get("mode", "text2video")
    logger.info(
        "validate_video_request: spec=%s mode=%s img_count=%d",
        spec.code, mode_str, img_count,
    )
    try:
        vm = VideoMode(mode_str)
    except ValueError:
        raise AppError(
            msg=f"Unknown video mode: {mode_str}",
            code=400,
            status_code=400,
        )

    if vm not in spec.modes:
        raise AppError(
            msg=f"Model {spec.code} does not support mode '{mode_str}'. "
                f"Supported: {[m.value for m in spec.modes]}",
            code=400,
            status_code=400,
        )

    # Duration — supports both continuous range and discrete list
    duration = param_json.get("duration")
    if duration is not None:
        duration = int(duration)
        if spec.duration_range:
            lo, hi = spec.duration_range
            if not (lo <= duration <= hi):
                raise AppError(
                    msg=f"Duration {duration}s out of range [{lo}, {hi}] for {spec.code}",
                    code=400,
                    status_code=400,
                )
        elif spec.durations and duration not in spec.durations:
            raise AppError(
                msg=f"Unsupported duration {duration}s for {spec.code}. "
                    f"Allowed: {spec.durations}",
                code=400,
                status_code=400,
            )
    else:
        if spec.duration_range:
            duration = 5  # sensible default within any range
        elif spec.durations:
            duration = spec.durations[0]
        else:
            duration = 4

    # Aspect ratio
    aspect_ratio = param_json.get("aspect_ratio", "16:9")
    if spec.aspect_ratios and aspect_ratio not in spec.aspect_ratios:
        raise AppError(
            msg=f"Unsupported aspect_ratio '{aspect_ratio}' for {spec.code}. "
                f"Allowed: {spec.aspect_ratios}",
            code=400,
            status_code=400,
        )

    # Image count vs mode — fallback to text2video when images are missing
    # but the model supports it, instead of raising an error.
    _can_fallback_t2v = VideoMode.TEXT2VIDEO in spec.modes

    if vm == VideoMode.TEXT2VIDEO:
        pass  # images ignored for text2video
    elif vm == VideoMode.IMAGE2VIDEO:
        if img_count < 1:
            if _can_fallback_t2v:
                logger.info("image2video requested without images; falling back to text2video for %s", spec.code)
                vm = VideoMode.TEXT2VIDEO
            else:
                raise AppError(
                    msg="image2video mode requires at least 1 image (first frame)",
                    code=400,
                    status_code=400,
                )
    elif vm == VideoMode.START_END:
        if img_count < 2:
            if _can_fallback_t2v and img_count == 0:
                logger.info("start_end requested without images; falling back to text2video for %s", spec.code)
                vm = VideoMode.TEXT2VIDEO
            else:
                raise AppError(
                    msg="start_end mode requires exactly 2 images (first + last frame)",
                    code=400,
                    status_code=400,
                )
    elif vm == VideoMode.REFERENCE:
        if img_count < 1:
            if _can_fallback_t2v:
                logger.info("reference requested without images; falling back to text2video for %s", spec.code)
                vm = VideoMode.TEXT2VIDEO
            else:
                raise AppError(
                    msg="reference mode requires at least 1 reference image",
                    code=400,
                    status_code=400,
                )
        if spec.max_ref_images and img_count > spec.max_ref_images:
            raise AppError(
                msg=f"reference mode accepts max {spec.max_ref_images} images, got {img_count}",
                code=400,
                status_code=400,
            )
    elif vm == VideoMode.MULTI_FRAME:
        if img_count < 2:
            raise AppError(
                msg="multi_frame mode requires at least 2 frame images",
                code=400,
                status_code=400,
            )
        if spec.max_frames and img_count > spec.max_frames:
            raise AppError(
                msg=f"multi_frame mode accepts max {spec.max_frames} frames, got {img_count}",
                code=400,
                status_code=400,
            )

    # Build cleaned param_json
    cleaned: dict[str, Any] = {
        "mode": vm.value,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
    }
    if images:
        cleaned["image_data_urls"] = images
    if param_json.get("style"):
        cleaned["style"] = param_json["style"]
    if param_json.get("resolution"):
        cleaned["resolution"] = param_json["resolution"]
    elif spec.resolutions:
        cleaned["resolution"] = spec.resolutions[0]
    if param_json.get("enhance"):
        cleaned["enhance"] = bool(param_json["enhance"])
    if param_json.get("seed") is not None:
        cleaned["seed"] = param_json["seed"]

    return cleaned
