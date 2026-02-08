"""LLM virtual keys

Revision ID: c9a3b1d4e2f7
Revises: 8a1b2c3d4e5f
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "c9a3b1d4e2f7"
down_revision: Union[str, None] = "8a1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_virtual_keys",
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
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default=sa.text("'default'")),
        sa.Column("litellm_key_id", sa.String(length=128), nullable=True),
        sa.Column("key_prefix", sa.String(length=16), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'active'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'revoked', 'expired')",
            name="ck_llm_virtual_keys_status",
        ),
        sa.UniqueConstraint("key_hash", name="uq_llm_virtual_keys_key_hash"),
    )
    op.create_index("idx_llm_virtual_keys_user", "llm_virtual_keys", ["user_id"], unique=False)
    op.create_index(
        "idx_llm_virtual_keys_user_status",
        "llm_virtual_keys",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_llm_virtual_keys_created_at",
        "llm_virtual_keys",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_llm_virtual_keys_created_at", table_name="llm_virtual_keys")
    op.drop_index("idx_llm_virtual_keys_user_status", table_name="llm_virtual_keys")
    op.drop_index("idx_llm_virtual_keys_user", table_name="llm_virtual_keys")
    op.drop_table("llm_virtual_keys")

