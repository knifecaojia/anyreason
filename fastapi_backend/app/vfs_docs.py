from __future__ import annotations

from typing import Literal, Any

from pydantic import BaseModel, Field


AssetType = Literal["character", "prop", "location", "vfx"]


class EpisodeDocV1(BaseModel):
    version: Literal[1] = 1
    episode_number: int = Field(ge=1)
    title: str | None = None
    summary: str | None = None
    content_md: str = ""


class AssetDocV1(BaseModel):
    version: Literal[1] = 1
    type: AssetType
    name: str = Field(min_length=1)
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    first_appearance_episode: int | None = Field(default=None, ge=1)
    meta: dict = Field(default_factory=dict)


class AssetVariantDocV2(BaseModel):
    variant_code: str | None = None
    stage_tag: str | None = None
    attributes: dict[str, Any] | None = None
    prompt_en: str | None = None


class AssetDocV2(BaseModel):
    version: Literal[2] = 2
    type: AssetType
    name: str = Field(min_length=1)
    keywords: list[str] = Field(default_factory=list)
    first_appearance_episode: int | None = Field(default=None, ge=1)
    details_md: str = ""
    provenance: dict = Field(default_factory=dict)
    variants: list[AssetVariantDocV2] = Field(default_factory=list)


class EpisodeAssetBindingV1(BaseModel):
    episode_number: int = Field(ge=1)
    asset_type: AssetType
    asset_name: str = Field(min_length=1)
    asset_node_id: str | None = None
    relation: str = Field(default="appears")


class EpisodeBindingsDocV1(BaseModel):
    version: Literal[1] = 1
    episode_number: int = Field(ge=1)
    bindings: list[EpisodeAssetBindingV1] = Field(default_factory=list)
