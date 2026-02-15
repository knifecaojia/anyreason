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
from sqlalchemy.orm import DeclarativeBase, relationship, backref
import sqlalchemy.orm


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
    workspaces = relationship(
        "WorkspaceMember",
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
    credit_account = relationship(
        "UserCreditAccount",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    credit_transactions = relationship(
        "CreditTransaction",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="CreditTransaction.user_id",
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(64), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    members = relationship(
        "WorkspaceMember",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    projects = relationship(
        "Project",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("idx_workspaces_owner", "owner_id"),
    )


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(20), nullable=False, server_default=text("'member'"))  # owner, admin, member
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="workspaces")

    __table_args__ = (
        Index("idx_workspace_members_user", "user_id"),
        CheckConstraint("role IN ('owner', 'admin', 'member')", name="ck_workspace_members_role"),
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


class AIModelConfig(Base):
    __tablename__ = "ai_model_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    category = Column(String(16), nullable=False)
    manufacturer = Column(String(64), nullable=False)
    model = Column(String(128), nullable=False)
    base_url = Column(Text, nullable=True)
    encrypted_api_key = Column(LargeBinary, nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    bindings = relationship(
        "AIModelBinding",
        back_populates="model_config",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("category", "manufacturer", "model", name="uq_ai_model_configs_category_manu_model"),
        Index("idx_ai_model_configs_category", "category"),
        Index("idx_ai_model_configs_enabled", "enabled"),
        Index("idx_ai_model_configs_sort", "category", "sort_order"),
        CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_model_configs_category",
        ),
    )


class AIModelBinding(Base):
    __tablename__ = "ai_model_bindings"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    key = Column(String(64), nullable=False)
    category = Column(String(16), nullable=False)
    ai_model_config_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_model_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    model_config = relationship("AIModelConfig", back_populates="bindings")

    __table_args__ = (
        UniqueConstraint("key", name="uq_ai_model_bindings_key"),
        Index("idx_ai_model_bindings_category", "category"),
        Index("idx_ai_model_bindings_model_config", "ai_model_config_id"),
        CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_model_bindings_category",
        ),
    )


class AIUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)

    category = Column(String(16), nullable=False)
    binding_key = Column(String(64), nullable=True)
    ai_model_config_id = Column(UUID(as_uuid=True), ForeignKey("ai_model_configs.id", ondelete="SET NULL"), nullable=True)

    cost_credits = Column(Integer, nullable=False, server_default=text("0"))
    latency_ms = Column(Integer, nullable=True)
    error_code = Column(String(64), nullable=True)
    raw_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    model_config = relationship("AIModelConfig")

    __table_args__ = (
        Index("idx_ai_usage_events_user", "user_id"),
        Index("idx_ai_usage_events_created_at", "created_at"),
        Index("idx_ai_usage_events_category", "category"),
        Index("idx_ai_usage_events_binding_key", "binding_key"),
        CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_usage_events_category",
        ),
    )


class Item(Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    user = relationship("User", back_populates="items")


class FileNode(Base):
    __tablename__ = "file_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)  # Null for global
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)  # Null for workspace-level
    parent_id = Column(UUID(as_uuid=True), ForeignKey("file_nodes.id", ondelete="CASCADE"), nullable=True)
    
    name = Column(String(255), nullable=False)
    is_folder = Column(Boolean, nullable=False, default=False)
    
    # For files only
    minio_bucket = Column(String(255), nullable=True)
    minio_key = Column(Text, nullable=True)
    content_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=False, server_default=text("0"))
    thumb_minio_bucket = Column(String(255), nullable=True)
    thumb_minio_key = Column(Text, nullable=True)
    thumb_content_type = Column(String(128), nullable=True)
    thumb_size_bytes = Column(Integer, nullable=False, server_default=text("0"))
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)

    children = relationship("FileNode", backref=sqlalchemy.orm.backref("parent", remote_side=[id]))
    workspace = relationship("Workspace")
    project = relationship("Project")

    __table_args__ = (
        Index("idx_file_nodes_parent", "parent_id"),
        Index("idx_file_nodes_workspace", "workspace_id"),
        Index("idx_file_nodes_project", "project_id"),
    )


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
    aspect_ratio = Column(String(16), nullable=True)
    animation_style = Column(String(64), nullable=True)

    minio_bucket = Column(String(255), nullable=False)
    minio_key = Column(Text, nullable=False)
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=False, server_default=text("0"))
    panorama_minio_bucket = Column(String(255), nullable=True)
    panorama_minio_key = Column(Text, nullable=True)
    panorama_original_filename = Column(String(255), nullable=True)
    panorama_content_type = Column(String(128), nullable=True)
    panorama_size_bytes = Column(Integer, nullable=False, server_default=text("0"))
    panorama_thumb_minio_bucket = Column(String(255), nullable=True)
    panorama_thumb_minio_key = Column(Text, nullable=True)
    panorama_thumb_content_type = Column(String(128), nullable=True)
    panorama_thumb_size_bytes = Column(Integer, nullable=False, server_default=text("0"))

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
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    owner = relationship("User", back_populates="projects")
    workspace = relationship("Workspace", back_populates="projects")
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
    episode_doc_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("file_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    storyboard_root_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("file_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    asset_root_node_id = Column(
        UUID(as_uuid=True),
        ForeignKey("file_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    word_count = Column(Integer, nullable=False, server_default=text("0"))
    start_line = Column(Integer, nullable=True)
    end_line = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'pending'"))
    stage_tag = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    project = relationship("Project", back_populates="episodes")
    storyboards = relationship(
        "Storyboard",
        back_populates="episode",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_bindings = relationship("AssetBinding", back_populates="episode")

    __table_args__ = (
        UniqueConstraint("project_id", "episode_code", name="uq_episodes_project_episode_code"),
    )


class Storyboard(Base):
    __tablename__ = "storyboards"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    episode_id = Column(UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True)

    # Identification
    shot_code = Column(String(50), nullable=False)  # e.g., EP01_SC01_SH01
    shot_number = Column(Integer, nullable=False)
    
    # Hierarchy (Virtual Grouping)
    scene_code = Column(String(50), nullable=True)  # e.g., EP01_SC01
    scene_number = Column(Integer, nullable=True)
    
    # Visual & Narrative
    shot_type = Column(String(20), nullable=True)
    camera_move = Column(String(50), nullable=True)
    narrative_function = Column(String(20), nullable=True)
    
    # Location & Time (Flattened from Scene)
    location = Column(String(100), nullable=True)
    location_type = Column(String(10), nullable=True)
    time_of_day = Column(String(50), nullable=True)
    
    # Content
    description = Column(Text, nullable=True)
    dialogue = Column(Text, nullable=True)
    duration_estimate = Column(Numeric(5, 2), nullable=True)
    
    # Assets (Reference to FileNode)
    active_assets = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    episode = relationship("Episode", back_populates="storyboards")
    video_prompts = relationship(
        "VideoPrompt",
        back_populates="storyboard",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    image_prompts = relationship(
        "ImagePrompt",
        back_populates="storyboard",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    asset_bindings = relationship("AssetBinding", back_populates="storyboard")

    __table_args__ = (
        UniqueConstraint("episode_id", "shot_code", name="uq_storyboards_episode_shot_code"),
        Index("idx_storyboards_episode", "episode_id"),
        Index("idx_storyboards_scene_group", "episode_id", "scene_number"),
    )


class VideoPrompt(Base):
    __tablename__ = "video_prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    storyboard_id = Column(UUID(as_uuid=True), ForeignKey("storyboards.id", ondelete="CASCADE"), nullable=True)

    prompt_main = Column(Text, nullable=True)
    negative_prompt = Column(Text, nullable=True)
    style_model = Column(String(50), nullable=True)
    aspect_ratio = Column(String(10), nullable=True)

    character_prompts = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    camera_settings = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    duration = Column(Numeric(5, 2), nullable=True)
    generation_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    storyboard = relationship("Storyboard", back_populates="video_prompts")


class ImagePrompt(Base):
    __tablename__ = "image_prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    storyboard_id = Column(UUID(as_uuid=True), ForeignKey("storyboards.id", ondelete="CASCADE"), nullable=True)

    prompt_main = Column(Text, nullable=True)
    negative_prompt = Column(Text, nullable=True)
    style_model = Column(String(50), nullable=True)
    aspect_ratio = Column(String(10), nullable=True)

    character_prompts = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    camera_settings = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    generation_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    storyboard = relationship("Storyboard", back_populates="image_prompts")


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
    storyboard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("storyboards.id", ondelete="CASCADE"),
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

    storyboard = relationship("Storyboard", backref="asset_relations")
    asset = relationship("Asset", back_populates="shot_relations")
    asset_variant = relationship("AssetVariant", back_populates="shot_relations")

    __table_args__ = (
        UniqueConstraint("storyboard_id", "asset_entity_id", name="uq_shot_asset_relations_shot_asset"),
        Index("idx_shot_asset_relations_asset", "asset_entity_id"),
        Index("idx_shot_asset_relations_shot", "storyboard_id"),
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
    storyboard_id = Column(UUID(as_uuid=True), ForeignKey("storyboards.id", ondelete="CASCADE"), nullable=True)

    state = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    asset = relationship("Asset", back_populates="bindings")
    asset_variant = relationship("AssetVariant")
    episode = relationship("Episode", back_populates="asset_bindings")
    storyboard = relationship("Storyboard", back_populates="asset_bindings")

    __table_args__ = (
        CheckConstraint(
            "((episode_id IS NOT NULL)::int + (storyboard_id IS NOT NULL)::int) = 1",
            name="ck_asset_bindings_single_target",
        ),
        UniqueConstraint("storyboard_id", "asset_entity_id", name="uq_asset_bindings_shot_asset"),
        UniqueConstraint("episode_id", "asset_entity_id", name="uq_asset_bindings_episode_asset"),
        Index("idx_asset_bindings_asset", "asset_entity_id"),
        Index("idx_asset_bindings_episode", "episode_id"),
        Index("idx_asset_bindings_shot", "storyboard_id"),
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


class UserCreditAccount(Base):
    __tablename__ = "user_credit_accounts"

    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    balance = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="credit_account")

    __table_args__ = (CheckConstraint("balance >= 0", name="ck_user_credit_accounts_balance_nonneg"),)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    delta = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reason = Column(String(64), nullable=False)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    meta = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", foreign_keys=[user_id], back_populates="credit_transactions")
    actor = relationship("User", foreign_keys=[actor_user_id])

    __table_args__ = (Index("idx_credit_transactions_user_created_at", "user_id", "created_at"),)


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(128), nullable=False)
    category = Column(String(16), nullable=False)
    purpose = Column(String(32), nullable=False, server_default=text("'general'"))
    ai_model_config_id = Column(UUID(as_uuid=True), ForeignKey("ai_model_configs.id", ondelete="RESTRICT"), nullable=False)
    capabilities = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    system_prompt = Column(Text, nullable=True)
    user_prompt_template = Column(Text, nullable=True)
    credits_per_call = Column(Integer, nullable=False, server_default=text("0"))
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    model_config = relationship("AIModelConfig")
    prompt_versions = relationship(
        "AgentPromptVersion",
        back_populates="agent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_agents_name"),
        CheckConstraint("category IN ('text','image','video')", name="ck_agents_category"),
        CheckConstraint(
            "purpose IN ("
            "'storyboard_extraction',"
            "'asset_extraction',"
            "'scene_extraction',"
            "'character_extraction',"
            "'prop_extraction',"
            "'vfx_extraction',"
            "'scene_creation',"
            "'prop_creation',"
            "'character_creation',"
            "'vfx_creation',"
            "'general'"
            ")",
            name="ck_agents_purpose",
        ),
        CheckConstraint("credits_per_call >= 0", name="ck_agents_credits_per_call_nonneg"),
        Index("idx_agents_category", "category"),
        Index("idx_agents_purpose", "purpose"),
        Index("idx_agents_enabled", "enabled"),
        Index("idx_agents_model_config", "ai_model_config_id"),
    )


class AgentPromptVersion(Base):
    __tablename__ = "agent_prompt_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    system_prompt = Column(Text, nullable=True)
    user_prompt_template = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    is_default = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    meta = Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    agent = relationship("Agent", back_populates="prompt_versions")
    creator = relationship("User")

    __table_args__ = (
        UniqueConstraint("agent_id", "version", name="uq_agent_prompt_versions_agent_version"),
        Index(
            "uq_agent_prompt_versions_default",
            "agent_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        Index("idx_agent_prompt_versions_agent", "agent_id"),
        Index("idx_agent_prompt_versions_created_at", "created_at"),
    )


class BuiltinAgent(Base):
    __tablename__ = "builtin_agents"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agent_code = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(32), nullable=False)
    default_ai_model_config_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_model_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    tools = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    model_config = relationship("AIModelConfig")
    prompt_versions = relationship(
        "BuiltinAgentPromptVersion",
        back_populates="builtin_agent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("agent_code", name="uq_builtin_agents_agent_code"),
        Index("idx_builtin_agents_category", "category"),
        Index("idx_builtin_agents_model_config", "default_ai_model_config_id"),
    )


class BuiltinAgentPromptVersion(Base):
    __tablename__ = "builtin_agent_prompt_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    builtin_agent_id = Column(UUID(as_uuid=True), ForeignKey("builtin_agents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    system_prompt = Column(Text, nullable=False)
    ai_model_config_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_model_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    description = Column(String(255), nullable=True)
    is_default = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    meta = Column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    builtin_agent = relationship("BuiltinAgent", back_populates="prompt_versions")
    model_config = relationship("AIModelConfig")
    creator = relationship("User")

    __table_args__ = (
        UniqueConstraint("builtin_agent_id", "version", name="uq_builtin_agent_prompt_versions_agent_version"),
        Index(
            "uq_builtin_agent_prompt_versions_default",
            "builtin_agent_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        Index("idx_builtin_agent_prompt_versions_agent", "builtin_agent_id"),
        Index("idx_builtin_agent_prompt_versions_created_at", "created_at"),
        Index("idx_builtin_agent_prompt_versions_model_config", "ai_model_config_id"),
    )


class BuiltinAgentUserOverride(Base):
    __tablename__ = "builtin_agent_user_overrides"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    builtin_agent_id = Column(UUID(as_uuid=True), ForeignKey("builtin_agents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    builtin_agent = relationship("BuiltinAgent")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("builtin_agent_id", "user_id", name="uq_builtin_agent_user_overrides_agent_user"),
        Index("idx_builtin_agent_user_overrides_user", "user_id"),
    )


class Scene(Base):
    __tablename__ = "scenes"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    scene_code = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    type = Column(String(32), nullable=False)
    description = Column(Text, nullable=True)
    builtin_agent_id = Column(UUID(as_uuid=True), ForeignKey("builtin_agents.id", ondelete="SET NULL"), nullable=True)
    required_tools = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    input_schema = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    output_schema = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    ui_config = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    builtin_agent = relationship("BuiltinAgent")

    __table_args__ = (
        UniqueConstraint("scene_code", name="uq_scenes_scene_code"),
        Index("idx_scenes_type", "type"),
        Index("idx_scenes_builtin_agent", "builtin_agent_id"),
    )


class UserAgent(Base):
    __tablename__ = "user_agents"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    agent_code = Column(String(64), nullable=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    base_builtin_agent_id = Column(UUID(as_uuid=True), ForeignKey("builtin_agents.id", ondelete="SET NULL"), nullable=True)
    system_prompt = Column(Text, nullable=False)
    ai_model_config_id = Column(UUID(as_uuid=True), ForeignKey("ai_model_configs.id", ondelete="SET NULL"), nullable=True)
    temperature = Column(Numeric, nullable=True)
    tools = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_public = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    workspace = relationship("Workspace")
    base_builtin_agent = relationship("BuiltinAgent")
    model_config = relationship("AIModelConfig")

    __table_args__ = (
        Index("idx_user_agents_user", "user_id"),
        Index("idx_user_agents_workspace", "workspace_id"),
        Index("idx_user_agents_public", "is_public"),
    )


class UserApp(Base):
    __tablename__ = "user_apps"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(128), nullable=True)
    flow_definition = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    trigger_type = Column(String(32), nullable=False, server_default=text("'manual'"))
    input_template = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    output_template = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    workspace = relationship("Workspace")

    __table_args__ = (
        Index("idx_user_apps_user", "user_id"),
        Index("idx_user_apps_workspace", "workspace_id"),
        Index("idx_user_apps_active", "is_active"),
    )
