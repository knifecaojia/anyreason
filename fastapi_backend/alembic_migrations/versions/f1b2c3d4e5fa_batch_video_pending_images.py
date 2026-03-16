"""Add batch video pending images and asset source mapping

Revision ID: f1b2c3d4e5fa
Revises: e5f6a7b8c9d0
Create Date: 2026-03-15 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.reflection import Inspector


revision: str = "f1b2c3d4e5fa"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    existing_tables = set(inspector.get_table_names())
    existing_indexes = {
        table_name: {index["name"] for index in inspector.get_indexes(table_name)}
        for table_name in {"batch_video_pending_images", "batch_video_assets"}
        if table_name in existing_tables
    }
    existing_columns = {
        table_name: {column["name"] for column in inspector.get_columns(table_name)}
        for table_name in {"batch_video_pending_images", "batch_video_assets"}
        if table_name in existing_tables
    }
    existing_foreign_keys = {
        fk["name"]
        for fk in inspector.get_foreign_keys("batch_video_assets")
    } if "batch_video_assets" in existing_tables else set()

    if "batch_video_pending_images" not in existing_tables:
        op.create_table(
            "batch_video_pending_images",
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
            sa.Column("original_filename", sa.String(length=255), nullable=True),
            sa.Column("content_type", sa.String(length=128), nullable=True),
            sa.Column("mode", sa.String(length=16), nullable=False, server_default=sa.text("'16:9'")),
            sa.Column("linked_cell_key", sa.String(length=128), nullable=True),
            sa.Column("linked_cell_label", sa.String(length=64), nullable=True),
            sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.CheckConstraint("mode IN ('16:9', '9:16')", name="ck_batch_video_pending_images_mode"),
        )
        existing_indexes["batch_video_pending_images"] = set()
        existing_columns["batch_video_pending_images"] = {
            "id",
            "job_id",
            "source_url",
            "thumbnail_url",
            "original_filename",
            "content_type",
            "mode",
            "linked_cell_key",
            "linked_cell_label",
            "processed",
            "created_at",
            "updated_at",
        }

    if "idx_batch_video_pending_images_job" not in existing_indexes.get("batch_video_pending_images", set()):
        op.create_index("idx_batch_video_pending_images_job", "batch_video_pending_images", ["job_id"], unique=False)
    if "idx_batch_video_pending_images_job_processed" not in existing_indexes.get("batch_video_pending_images", set()):
        op.create_index(
            "idx_batch_video_pending_images_job_processed",
            "batch_video_pending_images",
            ["job_id", "processed"],
            unique=False,
        )

    if "source_image_id" not in existing_columns.get("batch_video_assets", set()):
        op.add_column("batch_video_assets", sa.Column("source_image_id", postgresql.UUID(as_uuid=True), nullable=True))
    if "slice_index" not in existing_columns.get("batch_video_assets", set()):
        op.add_column("batch_video_assets", sa.Column("slice_index", sa.Integer(), nullable=True))
    if "fk_batch_video_assets_source_image_id" not in existing_foreign_keys:
        op.create_foreign_key(
            "fk_batch_video_assets_source_image_id",
            "batch_video_assets",
            "batch_video_pending_images",
            ["source_image_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "idx_batch_video_assets_source_image" not in existing_indexes.get("batch_video_assets", set()):
        op.create_index("idx_batch_video_assets_source_image", "batch_video_assets", ["source_image_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_batch_video_assets_source_image", table_name="batch_video_assets")
    op.drop_constraint("fk_batch_video_assets_source_image_id", "batch_video_assets", type_="foreignkey")
    op.drop_column("batch_video_assets", "slice_index")
    op.drop_column("batch_video_assets", "source_image_id")

    op.drop_index("idx_batch_video_pending_images_job_processed", table_name="batch_video_pending_images")
    op.drop_index("idx_batch_video_pending_images_job", table_name="batch_video_pending_images")
    op.drop_table("batch_video_pending_images")
