import uuid

from fastapi_users import schemas
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from datetime import date
from decimal import Decimal
from typing import Any, Literal


class UserRead(schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(schemas.BaseUserCreate):
    pass


class UserUpdate(schemas.BaseUserUpdate):
    pass


class ItemBase(BaseModel):
    name: str
    description: str | None = None
    quantity: int | None = None


class ItemCreate(ItemBase):
    pass


class ItemRead(ItemBase):
    id: UUID
    user_id: UUID

    model_config = {"from_attributes": True}


class ScriptRead(BaseModel):
    id: UUID
    owner_id: UUID
    title: str
    description: str | None = None
    aspect_ratio: str | None = None
    animation_style: str | None = None
    original_filename: str
    content_type: str | None = None
    size_bytes: int
    panorama_original_filename: str | None = None
    panorama_content_type: str | None = None
    panorama_size_bytes: int
    panorama_thumb_content_type: str | None = None
    panorama_thumb_size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ScriptStatsRead(BaseModel):
    script_id: UUID
    word_count: int
    episodes_count: int
    scene_count: int
    character_count: int
    prop_count: int
    vfx_count: int
    image_count: int
    video_count: int


class StoryboardRead(BaseModel):
    id: UUID
    episode_id: UUID
    shot_code: str
    shot_number: int
    scene_code: str | None = None
    scene_number: int | None = None
    shot_type: str | None = None
    camera_move: str | None = None
    narrative_function: str | None = None
    location: str | None = None
    location_type: str | None = None
    time_of_day: str | None = None
    description: str | None = None
    dialogue: str | None = None
    duration_estimate: Decimal | None = None
    active_assets: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class StoryboardUpdate(BaseModel):
    shot_code: str | None = None
    shot_number: int | None = None
    scene_code: str | None = None
    scene_number: int | None = None
    shot_type: str | None = None
    camera_move: str | None = None
    narrative_function: str | None = None
    location: str | None = None
    location_type: str | None = None
    time_of_day: str | None = None
    description: str | None = None
    dialogue: str | None = None
    duration_estimate: Decimal | None = None
    active_assets: list[str] | None = None


class StoryboardCreateRequest(BaseModel):
    shot_code: str
    shot_number: int | None = None
    scene_code: str | None = None
    scene_number: int | None = None
    shot_type: str | None = None
    camera_move: str | None = None
    narrative_function: str | None = None
    location: str | None = None
    location_type: str | None = None
    time_of_day: str | None = None
    description: str | None = None
    dialogue: str | None = None
    duration_estimate: Decimal | None = None
    active_assets: list[str] | None = None


class SceneCreate(BaseModel):
    title: str | None = None
    content: str | None = None
    location: str | None = None
    time_of_day: str | None = None


class SceneUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    location: str | None = None
    time_of_day: str | None = None


class AssetResourceRead(BaseModel):
    id: UUID
    variant_id: UUID
    res_type: str
    minio_bucket: str
    minio_key: str
    meta_data: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class AssetBrief(BaseModel):
    id: UUID
    asset_id: str
    doc_node_id: UUID | None = None
    name: str
    type: str
    category: str | None = None
    resources: list[AssetResourceRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AssetVariantRead(BaseModel):
    id: UUID
    asset_entity_id: UUID
    variant_code: str
    stage_tag: str | None = None
    age_range: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    prompt_template: str | None = None
    is_default: bool

    model_config = {"from_attributes": True}


class AssetRead(BaseModel):
    id: UUID
    project_id: UUID | None = None
    script_id: UUID | None = None
    doc_node_id: UUID | None = None
    asset_id: str
    name: str
    type: str
    category: str | None = None
    lifecycle_status: str
    source: str
    tags: list[str] = Field(default_factory=list)
    variants: list[AssetVariantRead] = Field(default_factory=list)
    resources: list[AssetResourceRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AssetUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    lifecycle_status: Literal["draft", "published", "archived"] | None = None
    tags: list[str] | None = None


class AssetCreate(BaseModel):
    project_id: UUID | None = None
    script_id: UUID | None = None
    name: str
    type: Literal["character", "scene", "prop", "vfx"]
    category: str | None = None
    source: str = "manual"
    content_md: str | None = None


class AssetVariantCreate(BaseModel):
    variant_code: str | None = None
    stage_tag: str | None = None
    age_range: str | None = None
    attributes: dict[str, Any] | None = None
    prompt_template: str | None = None
    is_default: bool | None = None


class AssetVariantUpdate(BaseModel):
    stage_tag: str | None = None
    age_range: str | None = None
    attributes: dict[str, Any] | None = None
    prompt_template: str | None = None
    is_default: bool | None = None


class AssetResourceCreateRequest(BaseModel):
    file_node_ids: list[UUID]
    res_type: str | None = None
    variant_id: UUID | None = None
    cover_file_node_id: UUID | None = None


class AssetResourceCheckRequest(BaseModel):
    resource_ids: list[UUID]


class AssetResourceCheckResponse(BaseModel):
    eligible: list[UUID]
    ineligible: dict[UUID, str]


class AssetBindingBrief(BaseModel):
    id: UUID
    asset_entity_id: UUID
    asset_variant_id: UUID | None = None
    name: str
    type: str
    category: str | None = None
    variant_code: str | None = None
    stage_tag: str | None = None
    age_range: str | None = None


class AssetBindingCreateRequest(BaseModel):
    asset_entity_id: UUID
    asset_variant_id: UUID | None = None


class StoryboardAssetBindingsResponse(BaseModel):
    storyboard_id: UUID
    bindings: list[AssetBindingBrief] = Field(default_factory=list)


class SceneAssetBindingsResponse(BaseModel):
    scene_id: UUID
    bindings: list[AssetBindingBrief] = Field(default_factory=list)


class ShotAssetBindingsMapResponse(BaseModel):
    scene_id: UUID
    shot_bindings: dict[UUID, list[AssetBindingBrief]] = Field(default_factory=dict)



class EpisodeRead(BaseModel):
    id: UUID
    episode_code: str
    episode_number: int
    title: str | None = None
    script_full_text: str | None = None
    storyboard_root_node_id: UUID | None = None
    asset_root_node_id: UUID | None = None
    storyboards: list[StoryboardRead] = []
    assets: list[AssetBrief] = []

    model_config = {"from_attributes": True}


class EpisodeCreateRequest(BaseModel):
    after_episode_id: UUID | None = None
    title: str | None = None
    script_full_text: str | None = None


class EpisodeUpdateRequest(BaseModel):
    title: str | None = None
    script_full_text: str | None = None


class EpisodeMutateRead(BaseModel):
    id: UUID
    project_id: UUID | None = None
    episode_code: str
    episode_number: int
    title: str | None = None
    script_full_text: str | None = None
    storyboard_root_node_id: UUID | None = None
    asset_root_node_id: UUID | None = None

    model_config = {"from_attributes": True}


class ScriptHierarchyRead(BaseModel):
    script_id: UUID
    episodes: list[EpisodeRead]


class FileNodeRead(BaseModel):
    id: UUID
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    parent_id: UUID | None = None
    name: str
    is_folder: bool
    minio_bucket: str | None = None
    minio_key: str | None = None
    content_type: str | None = None
    size_bytes: int
    thumb_minio_bucket: str | None = None
    thumb_minio_key: str | None = None
    thumb_content_type: str | None = None
    thumb_size_bytes: int
    created_at: datetime
    updated_at: datetime
    created_by: UUID | None = None

    model_config = {"from_attributes": True}


class WorkspaceMemberRead(BaseModel):
    user_id: UUID
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceRead(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    members: list[WorkspaceMemberRead] = []

    model_config = {"from_attributes": True}


class AIModelRead(BaseModel):
    provider: str
    model: str


class AISceneDraft(BaseModel):
    scene_number: int | None = None
    title: str | None = None
    content: str | None = None
    location: str | None = None
    time_of_day: str | None = None
    location_type: Literal["内", "外", "内外"] | None = None


class AIShotDraft(BaseModel):
    shot_type: str | None = None
    camera_angle: str | None = None
    camera_move: str | None = None
    filter_style: str | None = None
    narrative_function: str | None = None
    pov_character: str | None = None
    description: str | None = None
    dialogue: str | None = None
    dialogue_speaker: str | None = None
    sound_effect: str | None = None
    active_assets: list[str] = Field(default_factory=list)
    duration_estimate: float | None = None


class AIWorldUnityDraft(BaseModel):
    production_title: str | None = None
    era_setting: str | None = None
    unified_emblem: str | None = None
    base_costume: str | None = None
    color_system: str | None = None
    material_style: str | None = None
    lighting_style: str | None = None
    art_style: str | None = None
    notes: str | None = None


class AIAssetVariantDraft(BaseModel):
    variant_code: str | None = None
    stage_tag: str | None = None
    attributes: dict[str, Any] | None = None
    prompt_en: str | None = None


class AIAssetDraft(BaseModel):
    type: Literal["character", "scene", "prop", "vfx"]
    name: str
    category_path: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    importance: Literal["main", "support", "minor"] | None = None
    concept: str | None = None
    visual_details: dict[str, Any] | None = None
    prompt_en: str | None = None
    variants: list[AIAssetVariantDraft] = Field(default_factory=list)
    children: list["AIAssetDraft"] = Field(default_factory=list)


class AIEpisodeAssetExtractionPromptPreviewRequest(BaseModel):
    model: str
    provider: str | None = None
    prompt_template: str


class AIEpisodeAssetExtractionPromptPreviewResponse(BaseModel):
    final_prompt: str


class AIEpisodeAssetExtractionPreviewRequest(AIEpisodeAssetExtractionPromptPreviewRequest):
    temperature: float | None = None
    max_tokens: int | None = None


class AIEpisodeAssetExtractionPreviewResponse(BaseModel):
    final_prompt: str
    raw_text: str
    world_unity: AIWorldUnityDraft | None = None
    assets: list[AIAssetDraft] = Field(default_factory=list)


class AIEpisodeAssetExtractionApplyRequest(BaseModel):
    mode: Literal["replace", "append"] = "append"
    world_unity: AIWorldUnityDraft | None = None
    assets: list[AIAssetDraft] = Field(default_factory=list)


AIAssetDraft.model_rebuild()


class AISceneStructurePromptPreviewRequest(BaseModel):
    model: str
    provider: str | None = None
    prompt_template: str


class AISceneStructurePromptPreviewResponse(BaseModel):
    final_prompt: str


class AISceneStructurePreviewRequest(AISceneStructurePromptPreviewRequest):
    temperature: float | None = None
    max_tokens: int | None = None


class AISceneStructurePreviewResponse(BaseModel):
    final_prompt: str
    raw_text: str
    scenes: list[AISceneDraft] = Field(default_factory=list)


class AISceneStructureApplyRequest(BaseModel):
    mode: Literal["replace", "append"] = "replace"
    scenes: list[AISceneDraft] = Field(default_factory=list)


class AISceneStoryboardPromptPreviewRequest(BaseModel):
    model: str
    provider: str | None = None
    prompt_template: str


class AISceneStoryboardPromptPreviewResponse(BaseModel):
    final_prompt: str


class AISceneStoryboardPreviewRequest(AISceneStoryboardPromptPreviewRequest):
    temperature: float | None = None
    max_tokens: int | None = None


class AISceneStoryboardPreviewResponse(BaseModel):
    final_prompt: str
    raw_text: str
    shots: list[AIShotDraft] = Field(default_factory=list)


class AISceneStoryboardApplyRequest(BaseModel):
    mode: Literal["replace", "append"] = "replace"
    shots: list[AIShotDraft] = Field(default_factory=list)


class AIPromptPresetRead(BaseModel):
    id: UUID
    tool_key: str
    group: str | None = None
    name: str
    provider: str | None = None
    model: str | None = None
    prompt_template: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIPromptPresetCreateRequest(BaseModel):
    tool_key: str
    group: str | None = None
    name: str
    provider: str | None = None
    model: str | None = None
    prompt_template: str
    is_default: bool = False


class AIPromptPresetUpdateRequest(BaseModel):
    group: str | None = None
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    prompt_template: str | None = None
    is_default: bool | None = None


# Extended task status for video slot queue lifecycle:
# - queued_for_slot: waiting in FIFO queue for slot capacity
# - submitting: actively submitting to provider (after slot acquisition)
# - waiting_external: waiting for provider to complete (existing)
# - Other statuses: standard task lifecycle
TaskStatus = Literal[
    "queued",           # Initial state, waiting to be picked up by worker
    "queued_for_slot", # Waiting in FIFO queue for API key capacity
    "running",         # Actively processing (non-two-phase handlers)
    "submitting",      # Submitting to external provider after slot acquisition
    "waiting_external",# Waiting for external provider to complete generation
    "succeeded",       # Task completed successfully
    "failed",          # Task failed with error
    "canceled",        # Task was canceled by user
]


class TaskCreateRequest(BaseModel):
    type: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    input_json: dict[str, Any] = Field(default_factory=dict)


class TaskRead(BaseModel):
    id: UUID
    user_id: UUID
    type: str
    status: TaskStatus
    progress: int
    entity_type: str | None = None
    entity_id: UUID | None = None
    input_json: dict[str, Any] = Field(default_factory=dict)
    result_json: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None

    # Queue metadata for video slot queue lifecycle
    # These fields are only populated when status is "queued_for_slot"
    queue_position: int | None = None  # 1-based position in FIFO queue
    queued_at: datetime | None = None  # When task entered the queue

    # Slot owner metadata for tracking which task owns which slot
    # These fields are populated when task has acquired a slot or is submitting
    slot_owner_token: str | None = None  # Unique token proving slot ownership
    slot_config_id: UUID | None = None    # The model config this slot belongs to
    slot_acquired_at: datetime | None = None  # When slot was acquired

    model_config = {"from_attributes": True}


class TaskEventRead(BaseModel):
    id: UUID
    task_id: UUID
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskWsTicketRead(BaseModel):
    ticket: str
    expires_at: datetime


# ---------------------------------------------------------------------------
# Canvas (创作工坊) — M2.2
# ---------------------------------------------------------------------------

class CanvasCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class CanvasUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    node_count: int | None = None


class CanvasRead(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    user_id: UUID
    status: str
    canvas_json_node_id: UUID | None = None
    thumbnail_node_id: UUID | None = None
    node_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasNodeRead(BaseModel):
    id: UUID
    canvas_id: UUID
    frontend_node_id: str
    node_type: str
    source_storyboard_id: UUID | None = None
    source_asset_id: UUID | None = None
    config_json: dict[str, Any] = Field(default_factory=dict)
    status: str
    last_task_id: UUID | None = None
    output_file_node_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasNodeUpsert(BaseModel):
    frontend_node_id: str = Field(..., min_length=1, max_length=64)
    node_type: str = Field(..., min_length=1, max_length=32)
    source_storyboard_id: UUID | None = None
    source_asset_id: UUID | None = None
    config_json: dict[str, Any] = Field(default_factory=dict)


class CanvasExecutionRead(BaseModel):
    id: UUID
    canvas_id: UUID
    trigger_type: str
    status: str
    total_nodes: int
    completed_nodes: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result_summary: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# API Keys — M2.1 Spec09
# ---------------------------------------------------------------------------

class APIKeyRead(BaseModel):
    id: UUID
    user_id: UUID
    key: str
    name: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreateRequest(BaseModel):
    user_id: UUID | None = None  # Admin can specify user, otherwise self
    name: str | None = None
    key: str | None = None  # Optional, can be auto-generated


class APIKeyUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


# ---------------------------------------------------------------------------
# Queue Observability Schemas (Task 9)
# ---------------------------------------------------------------------------

class QueueDepthInfo(BaseModel):
    """Queue depth information for a model config."""
    config_id: UUID
    queue_depth: int  # Number of tasks waiting in queue
    oldest_queued_at: datetime | None = None  # Timestamp of oldest queued task
    newest_queued_at: datetime | None = None  # Timestamp of newest queued task


class SlotUtilizationInfo(BaseModel):
    """Slot utilization information for a model config."""
    config_id: UUID
    active: int  # Number of slots currently in use
    total: int  # Total available slots (sum of enabled key limits)
    available: int  # Number of available slots


class StaleOwnerInfo(BaseModel):
    """Information about a stale slot owner."""
    owner_token: str  # Owner token (safe - not a secret)
    key_id: str | None = None  # Key ID/hash (safe), not plaintext key
    enqueued_at: datetime | None = None
    acquired_at: datetime | None = None
    age_seconds: float | None = None
    task_id: str | None = None
    is_queue_entry: bool = False  # True if stale in queue, False if stale active


class QueueHealthConfigSummary(BaseModel):
    """Summary of queue health for a single model config."""
    config_id: UUID
    queue_depth: int
    active: int
    total: int
    available: int
    stale_queue_count: int
    stale_active_count: int


class QueueHealthResponse(BaseModel):
    """Combined queue health response."""
    summary: QueueHealthConfigSummary | None = None
    configs: dict[str, QueueHealthConfigSummary] = Field(default_factory=dict)
    stale_owners: list[StaleOwnerInfo] = Field(default_factory=list)
