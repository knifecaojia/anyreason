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
    original_filename: str
    content_type: str | None = None
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SceneRead(BaseModel):
    id: UUID
    scene_code: str
    scene_number: int
    title: str | None = None
    location: str | None = None
    time_of_day: str | None = None
    content: str | None = None

    model_config = {"from_attributes": True}


class ShotRead(BaseModel):
    id: UUID
    scene_id: UUID
    shot_code: str
    shot_number: int
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
    duration_estimate: Decimal | None = None

    model_config = {"from_attributes": True}


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


class AssetBrief(BaseModel):
    id: UUID
    asset_id: str
    name: str
    type: str
    category: str | None = None

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
    asset_id: str
    name: str
    type: str
    category: str | None = None
    lifecycle_status: str
    tags: list[str] = Field(default_factory=list)
    variants: list[AssetVariantRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AssetUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    lifecycle_status: Literal["draft", "published", "archived"] | None = None
    tags: list[str] | None = None


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


class SceneAssetBindingsResponse(BaseModel):
    scene_id: UUID
    bindings: list[AssetBindingBrief] = Field(default_factory=list)


class ShotAssetBindingsMapResponse(BaseModel):
    scene_id: UUID
    shot_bindings: dict[UUID, list[AssetBindingBrief]] = Field(default_factory=dict)



class EpisodeRead(BaseModel):
    id: UUID
    episode_code: str
    title: str | None = None
    script_full_text: str | None = None
    scenes: list[SceneRead] = []
    assets: list[AssetBrief] = []

    model_config = {"from_attributes": True}


class ScriptHierarchyRead(BaseModel):
    script_id: UUID
    episodes: list[EpisodeRead]


class LLMVirtualKeyRead(BaseModel):
    id: UUID
    purpose: str
    litellm_key_id: str | None = None
    key_prefix: str
    status: str
    created_at: datetime
    revoked_at: datetime | None = None
    expires_at: datetime | None = None
    last_seen_at: datetime | None = None

    model_config = {"from_attributes": True}


class LLMVirtualKeyIssueRequest(BaseModel):
    purpose: str = "default"
    duration_seconds: int | None = None


class LLMVirtualKeyIssueResponse(BaseModel):
    token: str
    record: LLMVirtualKeyRead


class LLMUsageDailyRead(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    request_count: int
    cost: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LLMUsageEventRead(BaseModel):
    id: UUID
    user_id: UUID | None = None
    request_id: str | None = None
    model: str | None = None
    endpoint: str | None = None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int | None = None
    cost: Decimal | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LLMModelNewRequest(BaseModel):
    model_name: str
    litellm_params: dict[str, Any]
    model_info: dict[str, Any] | None = None

    model_config = {"protected_namespaces": ()}


class LLMCustomServiceCreateRequest(BaseModel):
    name: str
    base_url: str
    api_key: str
    models: list[str] = Field(default_factory=list)
    enabled: bool = True


class LLMCustomServiceRead(BaseModel):
    id: UUID
    name: str
    kind: str
    base_url: str
    supported_models: list[str]
    created_models: list[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LLMChatAttachment(BaseModel):
    kind: Literal["image", "text"]
    name: str | None = None
    content_type: str | None = None
    data_url: str | None = None
    text: str | None = None


class LLMChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMChatRequest(BaseModel):
    model: str
    messages: list[LLMChatMessage] = Field(default_factory=list)
    attachments: list[LLMChatAttachment] = Field(default_factory=list)


class LLMChatResponse(BaseModel):
    output_text: str
    raw: dict[str, Any]


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
    name: str
    provider: str | None = None
    model: str | None = None
    prompt_template: str
    is_default: bool = False


class AIPromptPresetUpdateRequest(BaseModel):
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    prompt_template: str | None = None
    is_default: bool | None = None


TaskStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]


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
