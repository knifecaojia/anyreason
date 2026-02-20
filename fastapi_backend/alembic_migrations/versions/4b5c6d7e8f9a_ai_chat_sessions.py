"""add ai_chat_sessions and ai_chat_messages

Revision ID: 4b5c6d7e8f9a
Revises: 3a5c7e9b1d2f
Create Date: 2026-02-18 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "4b5c6d7e8f9a"
down_revision = "3a5c7e9b1d2f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=sa.text("'新对话'")),
        sa.Column("scene_code", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_ai_chat_sessions_user", "ai_chat_sessions", ["user_id"])
    op.create_index("idx_ai_chat_sessions_project", "ai_chat_sessions", ["project_id"])
    op.create_index("idx_ai_chat_sessions_user_updated", "ai_chat_sessions", ["user_id", "updated_at"])

    op.create_table(
        "ai_chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("plans", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("trace", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('user', 'assistant', 'system')", name="ck_ai_chat_messages_role"),
    )
    op.create_index("idx_ai_chat_messages_session", "ai_chat_messages", ["session_id"])
    op.create_index("idx_ai_chat_messages_session_created", "ai_chat_messages", ["session_id", "created_at"])


def downgrade():
    op.drop_index("idx_ai_chat_messages_session_created", table_name="ai_chat_messages")
    op.drop_index("idx_ai_chat_messages_session", table_name="ai_chat_messages")
    op.drop_table("ai_chat_messages")

    op.drop_index("idx_ai_chat_sessions_user_updated", table_name="ai_chat_sessions")
    op.drop_index("idx_ai_chat_sessions_project", table_name="ai_chat_sessions")
    op.drop_index("idx_ai_chat_sessions_user", table_name="ai_chat_sessions")
    op.drop_table("ai_chat_sessions")
