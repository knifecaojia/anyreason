"""LLM usage tables

Revision ID: d8e7c6b5a4f3
Revises: c9a3b1d4e2f7
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "d8e7c6b5a4f3"
down_revision: Union[str, None] = "c9a3b1d4e2f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_usage_events",
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
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("endpoint", sa.String(length=64), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Numeric(precision=18, scale=10), nullable=True),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_llm_usage_events_user", "llm_usage_events", ["user_id"], unique=False)
    op.create_index(
        "idx_llm_usage_events_created_at",
        "llm_usage_events",
        ["created_at"],
        unique=False,
    )
    op.create_index("idx_llm_usage_events_model", "llm_usage_events", ["model"], unique=False)

    op.create_table(
        "llm_usage_daily",
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
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cost", sa.Numeric(precision=18, scale=10), nullable=False, server_default=sa.text("0")),
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
        sa.UniqueConstraint("user_id", "date", "model", name="uq_llm_usage_daily_user_date_model"),
    )
    op.create_index(
        "idx_llm_usage_daily_user_date",
        "llm_usage_daily",
        ["user_id", "date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_llm_usage_daily_user_date", table_name="llm_usage_daily")
    op.drop_table("llm_usage_daily")

    op.drop_index("idx_llm_usage_events_model", table_name="llm_usage_events")
    op.drop_index("idx_llm_usage_events_created_at", table_name="llm_usage_events")
    op.drop_index("idx_llm_usage_events_user", table_name="llm_usage_events")
    op.drop_table("llm_usage_events")

