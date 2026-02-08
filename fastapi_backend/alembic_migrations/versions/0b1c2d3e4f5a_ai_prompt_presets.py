"""AI prompt presets

Revision ID: 0b1c2d3e4f5a
Revises: a7b8c9d0e1f2
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0b1c2d3e4f5a"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_prompt_presets",
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
        sa.Column("tool_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("prompt_template", sa.Text(), nullable=False),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
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
        sa.UniqueConstraint("user_id", "tool_key", "name", name="uq_ai_prompt_presets_user_tool_name"),
    )

    op.create_index("idx_ai_prompt_presets_user_tool", "ai_prompt_presets", ["user_id", "tool_key"])
    op.create_index("idx_ai_prompt_presets_user_updated_at", "ai_prompt_presets", ["user_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("idx_ai_prompt_presets_user_updated_at", table_name="ai_prompt_presets")
    op.drop_index("idx_ai_prompt_presets_user_tool", table_name="ai_prompt_presets")
    op.drop_table("ai_prompt_presets")
