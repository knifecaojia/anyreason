"""ai_manufacturers_and_models

Revision ID: 3e4f5a6b7c8d
Revises: 2d3e4f5a6b7c
Create Date: 2026-02-19 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "3e4f5a6b7c8d"
down_revision = "4b5c6d7e8f9a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_manufacturers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("provider_class", sa.String(length=128), nullable=True),
        sa.Column("default_base_url", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", "category", name="uq_ai_manufacturers_code_category"),
        sa.CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_manufacturers_category",
        ),
    )
    op.create_index("idx_ai_manufacturers_category", "ai_manufacturers", ["category"], unique=False)
    op.create_index("idx_ai_manufacturers_enabled", "ai_manufacturers", ["enabled"], unique=False)
    op.create_index("idx_ai_manufacturers_sort", "ai_manufacturers", ["category", "sort_order"], unique=False)

    op.create_table(
        "ai_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("manufacturer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("response_format", sa.String(length=16), server_default=sa.text("'schema'"), nullable=False),
        sa.Column("supports_image", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("supports_think", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("supports_tool", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("model_metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["manufacturer_id"], ["ai_manufacturers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manufacturer_id", "code", name="uq_ai_models_manufacturer_code"),
        sa.CheckConstraint(
            "response_format IN ('schema', 'object')",
            name="ck_ai_models_response_format",
        ),
    )
    op.create_index("idx_ai_models_manufacturer", "ai_models", ["manufacturer_id"], unique=False)
    op.create_index("idx_ai_models_enabled", "ai_models", ["enabled"], unique=False)
    op.create_index("idx_ai_models_sort", "ai_models", ["manufacturer_id", "sort_order"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_models_sort", table_name="ai_models")
    op.drop_index("idx_ai_models_enabled", table_name="ai_models")
    op.drop_index("idx_ai_models_manufacturer", table_name="ai_models")
    op.drop_table("ai_models")

    op.drop_index("idx_ai_manufacturers_sort", table_name="ai_manufacturers")
    op.drop_index("idx_ai_manufacturers_enabled", table_name="ai_manufacturers")
    op.drop_index("idx_ai_manufacturers_category", table_name="ai_manufacturers")
    op.drop_table("ai_manufacturers")
