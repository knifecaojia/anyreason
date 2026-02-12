"""ai_model_configs_and_bindings

Revision ID: aa11bb22cc33
Revises: ffffffffffff
Create Date: 2026-02-12 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "aa11bb22cc33"
down_revision = "ffffffffffff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_model_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("manufacturer", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=True),
        sa.Column("encrypted_api_key", sa.LargeBinary(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category", "manufacturer", "model", name="uq_ai_model_configs_category_manu_model"),
        sa.CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_model_configs_category",
        ),
    )
    op.create_index("idx_ai_model_configs_category", "ai_model_configs", ["category"], unique=False)
    op.create_index("idx_ai_model_configs_enabled", "ai_model_configs", ["enabled"], unique=False)
    op.create_index("idx_ai_model_configs_sort", "ai_model_configs", ["category", "sort_order"], unique=False)

    op.create_table(
        "ai_model_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ai_model_config_id"], ["ai_model_configs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_ai_model_bindings_key"),
        sa.CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_model_bindings_category",
        ),
    )
    op.create_index("idx_ai_model_bindings_category", "ai_model_bindings", ["category"], unique=False)
    op.create_index("idx_ai_model_bindings_model_config", "ai_model_bindings", ["ai_model_config_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_model_bindings_model_config", table_name="ai_model_bindings")
    op.drop_index("idx_ai_model_bindings_category", table_name="ai_model_bindings")
    op.drop_table("ai_model_bindings")

    op.drop_index("idx_ai_model_configs_sort", table_name="ai_model_configs")
    op.drop_index("idx_ai_model_configs_enabled", table_name="ai_model_configs")
    op.drop_index("idx_ai_model_configs_category", table_name="ai_model_configs")
    op.drop_table("ai_model_configs")

