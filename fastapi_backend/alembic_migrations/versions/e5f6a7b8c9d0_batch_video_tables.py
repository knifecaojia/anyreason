"""Batch video tables

Revision ID: e5f6a7b8c9d0
Revises: ddef79f74f17
Create Date: 2026-03-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'ddef79f74f17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE batch_video_job_status_enum AS ENUM ('draft', 'processing', 'completed', 'archived')")
    op.execute("CREATE TYPE batch_video_asset_status_enum AS ENUM ('pending', 'generating', 'completed', 'failed')")
    op.execute("CREATE TYPE batch_video_history_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed')")

    op.create_table(
        "batch_video_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            postgresql.ENUM("draft", "processing", "completed", "archived", name="batch_video_job_status_enum", create_type=False),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column("total_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("completed_assets", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'processing', 'completed', 'archived')",
            name="ck_batch_video_jobs_status",
        ),
    )
    op.create_index("idx_batch_video_jobs_user", "batch_video_jobs", ["user_id"], unique=False)
    op.create_index("idx_batch_video_jobs_user_status", "batch_video_jobs", ["user_id", "status"], unique=False)
    op.create_index("idx_batch_video_jobs_created_at", "batch_video_jobs", ["created_at"], unique=False)

    op.create_table(
        "batch_video_assets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batch_video_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("thumbnail_url", sa.String(length=512), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "status",
            postgresql.ENUM("pending", "generating", "completed", "failed", name="batch_video_asset_status_enum", create_type=False),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("result_url", sa.String(length=512), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'generating', 'completed', 'failed')",
            name="ck_batch_video_assets_status",
        ),
    )
    op.create_index("idx_batch_video_assets_job", "batch_video_assets", ["job_id"], unique=False)
    op.create_index("idx_batch_video_assets_job_index", "batch_video_assets", ["job_id", "index"], unique=False)
    op.create_index("idx_batch_video_assets_status", "batch_video_assets", ["status"], unique=False)

    op.create_table(
        "batch_video_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batch_video_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM("pending", "processing", "completed", "failed", name="batch_video_history_status_enum", create_type=False),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("progress", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("result_url", sa.String(length=512), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_batch_video_history_status",
        ),
    )
    op.create_index("idx_batch_video_history_asset", "batch_video_history", ["asset_id"], unique=False)
    op.create_index("idx_batch_video_history_task", "batch_video_history", ["task_id"], unique=False)
    op.create_index("idx_batch_video_history_created_at", "batch_video_history", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_batch_video_history_created_at", table_name="batch_video_history")
    op.drop_index("idx_batch_video_history_task", table_name="batch_video_history")
    op.drop_index("idx_batch_video_history_asset", table_name="batch_video_history")
    op.drop_table("batch_video_history")

    op.drop_index("idx_batch_video_assets_status", table_name="batch_video_assets")
    op.drop_index("idx_batch_video_assets_job_index", table_name="batch_video_assets")
    op.drop_index("idx_batch_video_assets_job", table_name="batch_video_assets")
    op.drop_table("batch_video_assets")

    op.drop_index("idx_batch_video_jobs_created_at", table_name="batch_video_jobs")
    op.drop_index("idx_batch_video_jobs_user_status", table_name="batch_video_jobs")
    op.drop_index("idx_batch_video_jobs_user", table_name="batch_video_jobs")
    op.drop_table("batch_video_jobs")

    op.execute("DROP TYPE IF EXISTS batch_video_history_status_enum")
    op.execute("DROP TYPE IF EXISTS batch_video_asset_status_enum")
    op.execute("DROP TYPE IF EXISTS batch_video_job_status_enum")
