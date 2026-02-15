from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.ai_tools.apply_plan import ApplyPlan


@dataclass(frozen=True)
class NormalizedApplyPlan:
    plan: ApplyPlan
    provenance: dict[str, Any]


def normalize_apply_plan(plan: ApplyPlan) -> NormalizedApplyPlan:
    tool_id = (plan.tool_id or "").strip()
    kind = plan.kind

    if kind == "episode_save" and tool_id == "episode_save":
        return NormalizedApplyPlan(plan=plan, provenance={})
    if kind == "asset_create" and tool_id == "asset_create":
        return NormalizedApplyPlan(plan=plan, provenance={})
    if kind == "asset_bind" and tool_id == "asset_bind":
        return NormalizedApplyPlan(plan=plan, provenance={})

    provenance = {"source_tool_id": tool_id}

    if kind == "episode_save" and tool_id == "preview_script_split":
        normalized = plan.model_copy(update={"tool_id": "episode_save"})
        return NormalizedApplyPlan(plan=normalized, provenance=provenance)

    if kind == "asset_create" and tool_id.startswith("preview_extract_"):
        normalized = plan.model_copy(update={"tool_id": "asset_create"})
        return NormalizedApplyPlan(plan=normalized, provenance=provenance)

    if kind == "storyboard_apply" and tool_id == "preview_storyboard_apply":
        normalized = plan.model_copy(update={"tool_id": "storyboard_apply"})
        return NormalizedApplyPlan(plan=normalized, provenance=provenance)

    if kind == "image_prompt_upsert" and tool_id == "preview_image_prompt":
        normalized = plan.model_copy(update={"tool_id": "image_prompt_upsert"})
        return NormalizedApplyPlan(plan=normalized, provenance=provenance)

    if kind == "video_prompt_upsert" and tool_id == "preview_video_prompt":
        normalized = plan.model_copy(update={"tool_id": "video_prompt_upsert"})
        return NormalizedApplyPlan(plan=normalized, provenance=provenance)

    return NormalizedApplyPlan(plan=plan, provenance=provenance)
