"""ai_model_test_text_and_video_runs

Revision ID: 8c9d0e1f2a3b
Revises: 7f8a9b0c1d2e
Create Date: 2026-02-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "8c9d0e1f2a3b"
down_revision = "7f8a9b0c1d2e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_model_test_text_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("messages", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["ai_model_test_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_model_test_text_runs_session", "ai_model_test_text_runs", ["session_id"], unique=False)
    op.create_index(
        "idx_ai_model_test_text_runs_session_created",
        "ai_model_test_text_runs",
        ["session_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "ai_model_test_video_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("aspect_ratio", sa.String(length=32), nullable=True),
        sa.Column("input_file_node_ids", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("output_file_node_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("output_content_type", sa.String(length=128), nullable=True),
        sa.Column("output_url", sa.Text(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["output_file_node_id"], ["file_nodes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_model_test_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_model_test_video_runs_session", "ai_model_test_video_runs", ["session_id"], unique=False)
    op.create_index(
        "idx_ai_model_test_video_runs_session_created",
        "ai_model_test_video_runs",
        ["session_id", "created_at"],
        unique=False,
    )
    op.create_index("idx_ai_model_test_video_runs_output_node", "ai_model_test_video_runs", ["output_file_node_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_model_test_video_runs_output_node", table_name="ai_model_test_video_runs")
    op.drop_index("idx_ai_model_test_video_runs_session_created", table_name="ai_model_test_video_runs")
    op.drop_index("idx_ai_model_test_video_runs_session", table_name="ai_model_test_video_runs")
    op.drop_table("ai_model_test_video_runs")

    op.drop_index("idx_ai_model_test_text_runs_session_created", table_name="ai_model_test_text_runs")
    op.drop_index("idx_ai_model_test_text_runs_session", table_name="ai_model_test_text_runs")
    op.drop_table("ai_model_test_text_runs")

