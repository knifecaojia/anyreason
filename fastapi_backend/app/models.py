from __future__ import annotations

from uuid import uuid4

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Boolean,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


asset_type_enum = ENUM(
    "character",
    "scene",
    "prop",
    "vfx",
    name="asset_type_enum",
    create_type=True,
)


class Base(DeclarativeBase):
    pass


class User(SQLAlchemyBaseUserTableUUID, Base):
    is_disabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    avatar_content_type = Column(String(128), nullable=True)
    avatar_data = Column(LargeBinary, nullable=True)

    items = relationship("Item", back_populates="user", cascade="all, delete-orphan")
    scripts = relationship("Script", back_populates="owner", cascade="all, delete-orphan")
    projects = relationship(
        "Project",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    llm_virtual_keys = relationship(
        "LLMVirtualKey",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ai_prompt_presets = relationship(
        "AIPromptPreset",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class LLMVirtualKey(Base):
    __tablename__ = "llm_virtual_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)

    purpose = Column(String(32), nullable=False, server_default=text("'default'"))
    litellm_key_id = Column(String(128), nullable=True)
    key_prefix = Column(String(16), nullable=False)
    key_hash = Column(String(64), nullable=False)
    encrypted_token = Column(LargeBinary, nullable=True)

    status = Column(String(16), nullable=False, server_default=text("'active'"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="llm_virtual_keys")

    __table_args__ = (
        UniqueConstraint("key_hash", name="uq_llm_virtual_keys_key_hash"),
        Index("idx_llm_virtual_keys_user", "user_id"),
        Index("idx_llm_virtual_keys_user_status", "user_id", "status"),
        Index("idx_llm_virtual_keys_created_at", "created_at"),
        CheckConstraint(
            "status IN ('active', 'revoked', 'expired')",
            name="ck_llm_virtual_keys_status",
        ),
    )


class LLMUsageEvent(Base):
    __tablename__ = "llm_usage_events"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)

    request_id = Column(String(64), nullable=True)
    model = Column(String(128), nullable=True)
    endpoint = Column(String(64), nullable=True)

    prompt_tokens = Column(Integer, nullable=False, server_default=text("0"))
    completion_tokens = Column(Integer, nullable=False, server_default=text("0"))
    total_tokens = Column(Integer, nullable=False, server_default=text("0"))

    latency_ms = Column(Integer, nullable=True)
    cost = Column(Numeric(18, 10), nullable=True)

    raw_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_llm_usage_events_user", "user_id"),
        Index("idx_llm_usage_events_created_at", "created_at"),
        Index("idx_llm_usage_events_model", "model"),
    )


class LLMUsageDaily(Base):
    __tablename__ = "llm_usage_daily"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    model = Column(String(128), nullable=False)

    prompt_tokens = Column(Integer, nullable=False, server_default=text("0"))
    completion_tokens = Column(Integer, nullable=False, server_default=text("0"))
    total_tokens = Column(Integer, nullable=False, server_default=text("0"))
    request_count = Column(Integer, nullable=False, server_default=text("0"))
    cost = Column(Numeric(18, 10), nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "date", "model", name="uq_llm_usage_daily_user_date_model"),
        Index("idx_llm_usage_daily_user_date", "user_id", "date"),
    )


class LLMCustomService(Base):
    __tablename__ = "llm_custom_services"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(128), nullable=False)
    kind = Column(String(32), nullable=False, server_default=text("'openai_compatible'"))
    base_url = Column(Text, nullable=False)
    supported_models = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_models = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    encrypted_api_key = Column(LargeBinary, nullable=False)
    enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    __table_args__ = (
        UniqueConstraint("name", name="uq_llm_custom_services_name"),
        Index("idx_llm_custom_services_enabled", "enabled"),
        Index("idx_llm_custom_services_created_at", "created_at"),
        CheckConstraint(
            "kind IN ('openai_compatible')",
            name="ck_llm_custom_services_kind",
        ),
    )


class AIPromptPreset(Base):
    __tablename__ = "ai_prompt_presets"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)

    tool_key = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    provider = Column(String(64), nullable=True)
    model = Column(String(128), nullable=True)
    prompt_template = Column(Text, nullable=False)
    is_default = Column(Boolean, nullable=False, server_default=text("false"), default=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="ai_prompt_presets")

    __table_args__ = (
        UniqueConstraint("user_id", "tool_key", "name", name="uq_ai_prompt_presets_user_tool_name"),
        Index("idx_ai_prompt_presets_user_tool", "user_id", "tool_key"),
        Index("idx_ai_prompt_presets_user_updated_at", "user_id", "updated_at"),
    )


class Item(Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    user = relationship("User", back_populates="items")


class Script(Base):
    __tablename__ = "scripts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    minio_bucket = Column(String(255), nullable=False)
    minio_key = Column(Text, nullable=False)
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    is_deleted = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", back_populates="scripts")

    __table_args__ = (
        Index("idx_scripts_owner", "owner_id"),
        Index("idx_scripts_owner_created_at", "owner_id", "created_at"),
        Index("idx_scripts_owner_is_deleted_created_at", "owner_id", "is_deleted", "created_at"),
    )


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    owner_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    owner = relationship("User", back_populates="projects")
    episodes = relationship(
        "Episode",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    assets = relationship(
        "Asset",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    qc_reports = relationship(
        "QCReport",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_tags = relationship(
        "AssetTag",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Asset(Base):
    __tablename__ = "assets"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)

    asset_id = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(asset_type_enum, nullable=False)
    category = Column(String(50), nullable=True)
    lifecycle_status = Column(String(20), nullable=False, server_default=text("'draft'"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    project = relationship("Project", back_populates="assets")
    variants = relationship(
        "AssetVariant",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    shot_relations = relationship("ShotAssetRelation", back_populates="asset")
    bindings = relationship("AssetBinding", back_populates="asset")
    tag_relations = relationship(
        "AssetTagRelation",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("project_id", "asset_id", name="uq_assets_project_asset_id"),
        Index("idx_assets_type", "project_id", "type"),
        CheckConstraint(
            "lifecycle_status IN ('draft', 'published', 'archived')",
            name="ck_assets_lifecycle_status",
        ),
    )


class AssetVariant(Base):
    __tablename__ = "asset_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    asset_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
    )

    variant_code = Column(String(50), nullable=False)
    stage_tag = Column(String(50), nullable=True)
    age_range = Column(String(50), nullable=True)

    attributes = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    prompt_template = Column(Text, nullable=True)
    is_default = Column(Boolean, nullable=False, server_default=text("false"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    asset = relationship("Asset", back_populates="variants")
    resources = relationship(
        "AssetResource",
        back_populates="variant",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    shot_relations = relationship("ShotAssetRelation", back_populates="asset_variant")

    __table_args__ = (
        UniqueConstraint(
            "asset_entity_id",
            "variant_code",
            name="uq_asset_variants_asset_entity_variant_code",
        ),
        Index("idx_asset_variants_asset", "asset_entity_id"),
        Index("idx_asset_variants_stage", "asset_entity_id", "stage_tag"),
    )


class AssetResource(Base):
    __tablename__ = "asset_resources"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    variant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("asset_variants.id", ondelete="CASCADE"),
        nullable=False,
    )

    res_type = Column(String(50), nullable=False)
    minio_bucket = Column(String(255), nullable=False)
    minio_key = Column(Text, nullable=False)
    meta_data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    variant = relationship("AssetVariant", back_populates="resources")

    __table_args__ = (
        Index("idx_asset_resources_variant", "variant_id"),
        Index("idx_asset_resources_type", "variant_id", "res_type"),
    )


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)

    episode_code = Column(String(20), nullable=False)
    episode_number = Column(Integer, nullable=False)

    title = Column(String(255), nullable=True)
    summary = Column(Text, nullable=True)
    script_full_text = Column(Text, nullable=True)

    word_count = Column(Integer, nullable=False, server_default=text("0"))
    start_line = Column(Integer, nullable=True)
    end_line = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'pending'"))
    stage_tag = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    project = relationship("Project", back_populates="episodes")
    scenes = relationship(
        "Scene",
        back_populates="episode",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_bindings = relationship("AssetBinding", back_populates="episode")

    __table_args__ = (
        UniqueConstraint("project_id", "episode_code", name="uq_episodes_project_episode_code"),
    )


class Scene(Base):
    __tablename__ = "scenes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    episode_id = Column(UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True)

    scene_code = Column(String(50), nullable=False)
    scene_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=True)

    location = Column(String(100), nullable=True)
    location_type = Column(String(10), nullable=True)
    time_of_day = Column(String(50), nullable=True)
    weather = Column(String(50), nullable=True)
    mood = Column(String(50), nullable=True)

    z_depth = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    content = Column(Text, nullable=True)
    key_events = Column(JSONB, nullable=True)

    content_start_pos = Column(Integer, nullable=True)
    content_end_pos = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    episode = relationship("Episode", back_populates="scenes")
    shots = relationship(
        "Shot",
        back_populates="scene",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_bindings = relationship("AssetBinding", back_populates="scene")

    __table_args__ = (
        UniqueConstraint("episode_id", "scene_code", name="uq_scenes_episode_scene_code"),
        CheckConstraint("location_type IN ('内', '外', '内外')", name="ck_scenes_location_type"),
    )


class Shot(Base):
    __tablename__ = "shots"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    scene_id = Column(UUID(as_uuid=True), ForeignKey("scenes.id", ondelete="CASCADE"), nullable=True)

    shot_code = Column(String(50), nullable=False)
    shot_number = Column(Integer, nullable=False)

    shot_type = Column(String(20), nullable=True)
    camera_angle = Column(String(20), nullable=True)
    camera_move = Column(String(50), nullable=True)
    filter_style = Column(String(50), nullable=True)
    narrative_function = Column(String(20), nullable=True)
    pov_character = Column(String(100), nullable=True)

    description = Column(Text, nullable=True)
    dialogue = Column(Text, nullable=True)
    dialogue_speaker = Column(String(100), nullable=True)
    sound_effect = Column(String(100), nullable=True)

    active_assets = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    duration_estimate = Column(Numeric(5, 2), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    scene = relationship("Scene", back_populates="shots")
    asset_relations = relationship(
        "ShotAssetRelation",
        back_populates="shot",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_bindings = relationship("AssetBinding", back_populates="shot")
    video_prompts = relationship(
        "VideoPrompt",
        back_populates="shot",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("scene_id", "shot_code", name="uq_shots_scene_shot_code"),
    )


class VideoPrompt(Base):
    __tablename__ = "video_prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    shot_id = Column(UUID(as_uuid=True), ForeignKey("shots.id", ondelete="CASCADE"), nullable=True)

    prompt_main = Column(Text, nullable=True)
    negative_prompt = Column(Text, nullable=True)
    style_model = Column(String(50), nullable=True)
    aspect_ratio = Column(String(10), nullable=True)

    character_prompts = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    camera_settings = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    duration = Column(Numeric(5, 2), nullable=True)
    generation_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    shot = relationship("Shot", back_populates="video_prompts")


class QCReport(Base):
    __tablename__ = "qc_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)

    check_time = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    iteration = Column(Integer, nullable=True)

    status = Column(String(20), nullable=True)
    total_issues = Column(Integer, nullable=True)
    critical_issues = Column(Integer, nullable=True)

    report_content = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    project = relationship("Project", back_populates="qc_reports")


class ShotAssetRelation(Base):
    __tablename__ = "shot_asset_relations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    shot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("shots.id", ondelete="CASCADE"),
        nullable=False,
    )
    asset_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    asset_variant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("asset_variants.id", ondelete="SET NULL"),
        nullable=True,
    )

    state = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    shot = relationship("Shot", back_populates="asset_relations")
    asset = relationship("Asset", back_populates="shot_relations")
    asset_variant = relationship("AssetVariant", back_populates="shot_relations")

    __table_args__ = (
        UniqueConstraint("shot_id", "asset_entity_id", name="uq_shot_asset_relations_shot_asset"),
        Index("idx_shot_asset_relations_asset", "asset_entity_id"),
        Index("idx_shot_asset_relations_shot", "shot_id"),
    )


class AssetBinding(Base):
    __tablename__ = "asset_bindings"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    asset_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    asset_variant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("asset_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    episode_id = Column(UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True)
    scene_id = Column(UUID(as_uuid=True), ForeignKey("scenes.id", ondelete="CASCADE"), nullable=True)
    shot_id = Column(UUID(as_uuid=True), ForeignKey("shots.id", ondelete="CASCADE"), nullable=True)

    state = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    asset = relationship("Asset", back_populates="bindings")
    asset_variant = relationship("AssetVariant")
    episode = relationship("Episode", back_populates="asset_bindings")
    scene = relationship("Scene", back_populates="asset_bindings")
    shot = relationship("Shot", back_populates="asset_bindings")

    __table_args__ = (
        CheckConstraint(
            "((episode_id IS NOT NULL)::int + (scene_id IS NOT NULL)::int + (shot_id IS NOT NULL)::int) = 1",
            name="ck_asset_bindings_single_target",
        ),
        UniqueConstraint("shot_id", "asset_entity_id", name="uq_asset_bindings_shot_asset"),
        UniqueConstraint("scene_id", "asset_entity_id", name="uq_asset_bindings_scene_asset"),
        UniqueConstraint("episode_id", "asset_entity_id", name="uq_asset_bindings_episode_asset"),
        Index("idx_asset_bindings_asset", "asset_entity_id"),
        Index("idx_asset_bindings_episode", "episode_id"),
        Index("idx_asset_bindings_scene", "scene_id"),
        Index("idx_asset_bindings_shot", "shot_id"),
    )


class AssetTag(Base):
    __tablename__ = "asset_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    project = relationship("Project", back_populates="asset_tags")
    relations = relationship(
        "AssetTagRelation",
        back_populates="tag",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_asset_tags_project_name"),
        Index("idx_asset_tags_project", "project_id"),
    )


class AssetTagRelation(Base):
    __tablename__ = "asset_tag_relations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    asset_entity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_id = Column(
        UUID(as_uuid=True),
        ForeignKey("asset_tags.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    asset = relationship("Asset", back_populates="tag_relations")
    tag = relationship("AssetTag", back_populates="relations")

    __table_args__ = (
        UniqueConstraint("asset_entity_id", "tag_id", name="uq_asset_tag_relations_asset_tag"),
        Index("idx_asset_tag_relations_asset", "asset_entity_id"),
        Index("idx_asset_tag_relations_tag", "tag_id"),
    )


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(64), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    users = relationship(
        "UserRole",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    permissions = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_roles_name"),
        Index("idx_roles_name", "name"),
    )


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    code = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    roles = relationship(
        "RolePermission",
        back_populates="permission",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("code", name="uq_permissions_code"),
        Index("idx_permissions_code", "code"),
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    role = relationship("Role", back_populates="users")

    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("idx_user_roles_user", "user_id"),
        Index("idx_user_roles_role", "role_id"),
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")

    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
        Index("idx_role_permissions_role", "role_id"),
        Index("idx_role_permissions_permission", "permission_id"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(128), nullable=False)
    resource_type = Column(String(64), nullable=True)
    resource_id = Column(UUID(as_uuid=True), nullable=True)
    success = Column(Boolean, nullable=False, server_default=text("true"))

    request_id = Column(String(64), nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)

    meta = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    actor = relationship("User")

    __table_args__ = (
        Index("idx_audit_logs_actor", "actor_user_id"),
        Index("idx_audit_logs_created_at", "created_at"),
        Index("idx_audit_logs_action", "action"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)

    type = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, server_default=text("'queued'"))
    progress = Column(Integer, nullable=False, server_default=text("0"))

    entity_type = Column(String(32), nullable=True)
    entity_id = Column(UUID(as_uuid=True), nullable=True)

    input_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    result_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    events = relationship(
        "TaskEvent",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')",
            name="ck_tasks_status",
        ),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_tasks_progress"),
        Index("idx_tasks_user", "user_id"),
        Index("idx_tasks_user_status", "user_id", "status"),
        Index("idx_tasks_entity", "entity_type", "entity_id"),
        Index("idx_tasks_created_at", "created_at"),
    )


class TaskEvent(Base):
    __tablename__ = "task_events"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(32), nullable=False)
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    task = relationship("Task", back_populates="events")

    __table_args__ = (
        Index("idx_task_events_task", "task_id"),
        Index("idx_task_events_task_created_at", "task_id", "created_at"),
    )
