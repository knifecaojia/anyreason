"""Add manju script hierarchy tables

Revision ID: 7c2f0f2a1d9e
Revises: b389592974f8
Create Date: 2026-02-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "7c2f0f2a1d9e"
down_revision: Union[str, None] = "b389592974f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    asset_type_enum = postgresql.ENUM(
        "character",
        "scene",
        "prop",
        "vfx",
        name="asset_type_enum",
        create_type=False,
    )
    asset_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "projects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "assets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("asset_id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("type", asset_type_enum, nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column(
            "visual_features",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "appearances",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("first_appearance_ref", sa.String(length=50), nullable=True),
        sa.Column("prompt_template", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("project_id", "asset_id", name="uq_assets_project_asset_id"),
    )
    op.create_index("idx_assets_type", "assets", ["project_id", "type"], unique=False)

    op.create_table(
        "episodes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("episode_code", sa.String(length=20), nullable=False),
        sa.Column("episode_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "word_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("start_line", sa.Integer(), nullable=True),
        sa.Column("end_line", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "project_id", "episode_code", name="uq_episodes_project_episode_code"
        ),
    )

    op.create_table(
        "scenes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "episode_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("episodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("scene_code", sa.String(length=50), nullable=False),
        sa.Column("scene_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("location", sa.String(length=100), nullable=True),
        sa.Column("location_type", sa.String(length=10), nullable=True),
        sa.Column("time_of_day", sa.String(length=50), nullable=True),
        sa.Column("weather", sa.String(length=50), nullable=True),
        sa.Column("mood", sa.String(length=50), nullable=True),
        sa.Column(
            "z_depth",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("key_events", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("content_start_pos", sa.Integer(), nullable=True),
        sa.Column("content_end_pos", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "location_type IN ('内', '外', '内外')", name="ck_scenes_location_type"
        ),
        sa.UniqueConstraint("episode_id", "scene_code", name="uq_scenes_episode_scene_code"),
    )

    op.create_table(
        "shots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "scene_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scenes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("shot_code", sa.String(length=50), nullable=False),
        sa.Column("shot_number", sa.Integer(), nullable=False),
        sa.Column("shot_type", sa.String(length=20), nullable=True),
        sa.Column("camera_angle", sa.String(length=20), nullable=True),
        sa.Column("camera_move", sa.String(length=50), nullable=True),
        sa.Column("filter_style", sa.String(length=50), nullable=True),
        sa.Column("narrative_function", sa.String(length=20), nullable=True),
        sa.Column("pov_character", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("dialogue", sa.Text(), nullable=True),
        sa.Column("dialogue_speaker", sa.String(length=100), nullable=True),
        sa.Column("sound_effect", sa.String(length=100), nullable=True),
        sa.Column(
            "active_assets",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("duration_estimate", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("scene_id", "shot_code", name="uq_shots_scene_shot_code"),
    )

    op.create_table(
        "video_prompts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shots.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("prompt_main", sa.Text(), nullable=True),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        sa.Column("style_model", sa.String(length=50), nullable=True),
        sa.Column("aspect_ratio", sa.String(length=10), nullable=True),
        sa.Column(
            "character_prompts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "camera_settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("duration", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("generation_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "qc_reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "check_time",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("iteration", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("total_issues", sa.Integer(), nullable=True),
        sa.Column("critical_issues", sa.Integer(), nullable=True),
        sa.Column("report_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("qc_reports")
    op.drop_table("video_prompts")
    op.drop_table("shots")
    op.drop_table("scenes")
    op.drop_table("episodes")
    op.drop_index("idx_assets_type", table_name="assets")
    op.drop_table("assets")
    op.drop_table("projects")

    asset_type_enum = postgresql.ENUM(
        "character",
        "scene",
        "prop",
        "vfx",
        name="asset_type_enum",
    )
    asset_type_enum.drop(op.get_bind(), checkfirst=True)
