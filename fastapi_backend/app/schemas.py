import uuid

from fastapi_users import schemas
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


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

    model_config = {"from_attributes": True}


class EpisodeRead(BaseModel):
    id: UUID
    episode_code: str
    episode_number: int
    title: str | None = None
    script_full_text: str | None = None
    scenes: list[SceneRead] = []
    assets: list[AssetBrief] = []

    model_config = {"from_attributes": True}


class ScriptHierarchyRead(BaseModel):
    script_id: UUID
    episodes: list[EpisodeRead]
