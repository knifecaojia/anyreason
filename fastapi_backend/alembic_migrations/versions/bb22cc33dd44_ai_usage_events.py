"""ai_usage_events

Revision ID: bb22cc33dd44
Revises: aa11bb22cc33
Create Date: 2026-02-12 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "bb22cc33dd44"
down_revision = "aa11bb22cc33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("binding_key", sa.String(length=64), nullable=True),
        sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cost_credits", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ai_model_config_id"], ["ai_model_configs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "category IN ('text', 'image', 'video')",
            name="ck_ai_usage_events_category",
        ),
    )
    op.create_index("idx_ai_usage_events_user", "ai_usage_events", ["user_id"], unique=False)
    op.create_index("idx_ai_usage_events_created_at", "ai_usage_events", ["created_at"], unique=False)
    op.create_index("idx_ai_usage_events_category", "ai_usage_events", ["category"], unique=False)
    op.create_index("idx_ai_usage_events_binding_key", "ai_usage_events", ["binding_key"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_usage_events_binding_key", table_name="ai_usage_events")
    op.drop_index("idx_ai_usage_events_category", table_name="ai_usage_events")
    op.drop_index("idx_ai_usage_events_created_at", table_name="ai_usage_events")
    op.drop_index("idx_ai_usage_events_user", table_name="ai_usage_events")
    op.drop_table("ai_usage_events")

