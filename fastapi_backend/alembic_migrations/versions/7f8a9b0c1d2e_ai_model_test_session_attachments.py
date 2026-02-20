"""ai_model_test_session_attachments

Revision ID: 7f8a9b0c1d2e
Revises: 6e7f8a9b0c1d
Create Date: 2026-02-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "7f8a9b0c1d2e"
down_revision = "6e7f8a9b0c1d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_model_test_sessions",
        sa.Column(
            "image_attachment_node_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("ai_model_test_sessions", "image_attachment_node_ids")

