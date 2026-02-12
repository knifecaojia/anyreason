"""agents_channel_and_capabilities

Revision ID: c1a2b3c4d5e7
Revises: c1a2b3c4d5e6
Create Date: 2026-02-11 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c1a2b3c4d5e7"
down_revision = "c1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "agents",
        sa.Column("channel", sa.String(length=32), server_default=sa.text("'system_litellm'"), nullable=False),
    )
    op.add_column(
        "agents",
        sa.Column(
            "capabilities",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE agents
            SET capabilities = CASE category
                WHEN 'dialogue' THEN '["text"]'::jsonb
                WHEN 'image' THEN '["image"]'::jsonb
                WHEN 'audio' THEN '["audio"]'::jsonb
                WHEN 'video' THEN '["video"]'::jsonb
                ELSE '[]'::jsonb
            END
            """
        )
    )


def downgrade():
    op.drop_column("agents", "capabilities")
    op.drop_column("agents", "channel")
