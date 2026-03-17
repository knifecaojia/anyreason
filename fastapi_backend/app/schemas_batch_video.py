from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BatchVideoJobConfig(BaseModel):
    model_config_id: Optional[str] = None  # UUID as string
    duration: int = 5
    resolution: str = "1280x720"
    off_peak: bool = False


class BatchVideoJobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    config: Optional[BatchVideoJobConfig] = None


class BatchVideoJobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    config: Optional[BatchVideoJobConfig] = None
    status: Optional[str] = None


class BatchVideoJobRead(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    config: dict
    status: str
    total_assets: int
    completed_assets: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchVideoAssetCreate(BaseModel):
    source_url: str
    thumbnail_url: Optional[str] = None
    prompt: Optional[str] = None
    index: int = 0
    source_image_id: Optional[UUID] = None
    slice_index: Optional[int] = None


class BatchVideoAssetUpdate(BaseModel):
    prompt: Optional[str] = None
    index: Optional[int] = None
    status: Optional[str] = None
    result_url: Optional[str] = None
    error_message: Optional[str] = None
    source_image_id: Optional[UUID] = None
    slice_index: Optional[int] = None


class BatchVideoAssetRead(BaseModel):
    id: UUID
    job_id: UUID
    source_url: str
    thumbnail_url: Optional[str]
    prompt: Optional[str]
    index: int
    status: str
    result_url: Optional[str]
    error_message: Optional[str]
    source_image_id: Optional[UUID]
    slice_index: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchVideoPendingImageCreate(BaseModel):
    source_url: str
    thumbnail_url: Optional[str] = None
    original_filename: Optional[str] = None
    content_type: Optional[str] = None
    mode: str = "16:9"
    linked_cell_key: Optional[str] = None
    linked_cell_label: Optional[str] = None
    processed: bool = False


class BatchVideoPendingImageUpdate(BaseModel):
    mode: Optional[str] = None
    linked_cell_key: Optional[str] = None
    linked_cell_label: Optional[str] = None
    processed: Optional[bool] = None


class BatchVideoPendingImageRead(BaseModel):
    id: UUID
    job_id: UUID
    source_url: str
    thumbnail_url: Optional[str]
    original_filename: Optional[str]
    content_type: Optional[str]
    mode: str
    linked_cell_key: Optional[str]
    linked_cell_label: Optional[str]
    processed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchVideoHistoryRead(BaseModel):
    id: UUID
    asset_id: UUID
    task_id: Optional[UUID]
    status: str
    progress: int
    result_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class BatchVideoPreviewTaskRead(BaseModel):
    task_id: UUID
    status: str
    progress: int
    created_at: datetime
    updated_at: datetime | None = None
    completed_at: datetime | None = None
    result_url: Optional[str] = None
    error_message: Optional[str] = None
    external_task_id: Optional[str] = None
    prompt: Optional[str] = None


class BatchVideoPreviewSuccessRead(BaseModel):
    result_url: str
    completed_at: datetime | None = None


class BatchVideoPreviewCardRead(BaseModel):
    asset_id: UUID
    index: int
    card_thumbnail_url: str
    card_source_url: str | None = None
    prompt: Optional[str] = None
    latest_task: BatchVideoPreviewTaskRead | None = None
    latest_success: BatchVideoPreviewSuccessRead | None = None
    history: list[BatchVideoPreviewTaskRead]


class BatchVideoPreviewCardsResponse(BaseModel):
    job: BatchVideoJobRead
    cards: list[BatchVideoPreviewCardRead]


class BatchVideoTaskActionRead(BaseModel):
    task_id: UUID
    asset_id: UUID
    status: str


class BatchVideoExternalCancelRead(BaseModel):
    attempted: bool
    supported: bool
    message: str


class BatchVideoStopTaskRead(BaseModel):
    task_id: UUID
    asset_id: UUID
    status: str
    external_cancel: BatchVideoExternalCancelRead


class BatchVideoGenerateRequest(BaseModel):
    asset_ids: list[UUID]


class BatchVideoPolishRequest(BaseModel):
    asset_ids: list[UUID]
    instruction: str = "请优化这段提示词，使视频生成效果更好"


class BatchVideoExcelImportRequest(BaseModel):
    index_column: str = "序号"
    prompt_column: str = "提示词"


class BatchVideoBatchPromptUpdateItem(BaseModel):
    asset_id: UUID
    prompt: str


class BatchVideoBatchPromptUpdateRequest(BaseModel):
    updates: list[BatchVideoBatchPromptUpdateItem]


class BatchVideoUploadImageItem(BaseModel):
    dataUrl: str
    source_image_id: Optional[UUID] = None
    slice_index: Optional[int] = None


class BatchVideoUploadAssetsRequest(BaseModel):
    images: list[BatchVideoUploadImageItem]
