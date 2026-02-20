"""ai_model_test_sessions_and_image_runs

Revision ID: 5d6e7f8a9b0c
Revises: 3e4f5a6b7c8d
Create Date: 2026-02-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "5d6e7f8a9b0c"
down_revision = "3e4f5a6b7c8d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_model_test_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=255), server_default=sa.text("'模型测试'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("category IN ('text', 'image', 'video')", name="ck_ai_model_test_sessions_category"),
        sa.ForeignKeyConstraint(["ai_model_config_id"], ["ai_model_configs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_model_test_sessions_user", "ai_model_test_sessions", ["user_id"], unique=False)
    op.create_index("idx_ai_model_test_sessions_user_updated", "ai_model_test_sessions", ["user_id", "updated_at"], unique=False)
    op.create_index("idx_ai_model_test_sessions_category", "ai_model_test_sessions", ["category"], unique=False)
    op.create_index("idx_ai_model_test_sessions_model_config", "ai_model_test_sessions", ["ai_model_config_id"], unique=False)

    op.create_table(
        "ai_model_test_image_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("resolution", sa.String(length=32), nullable=True),
        sa.Column("input_image_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("output_url", sa.Text(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["ai_model_test_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_model_test_image_runs_session", "ai_model_test_image_runs", ["session_id"], unique=False)
    op.create_index("idx_ai_model_test_image_runs_session_created", "ai_model_test_image_runs", ["session_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_model_test_image_runs_session_created", table_name="ai_model_test_image_runs")
    op.drop_index("idx_ai_model_test_image_runs_session", table_name="ai_model_test_image_runs")
    op.drop_table("ai_model_test_image_runs")

    op.drop_index("idx_ai_model_test_sessions_model_config", table_name="ai_model_test_sessions")
    op.drop_index("idx_ai_model_test_sessions_category", table_name="ai_model_test_sessions")
    op.drop_index("idx_ai_model_test_sessions_user_updated", table_name="ai_model_test_sessions")
    op.drop_index("idx_ai_model_test_sessions_user", table_name="ai_model_test_sessions")
    op.drop_table("ai_model_test_sessions")

