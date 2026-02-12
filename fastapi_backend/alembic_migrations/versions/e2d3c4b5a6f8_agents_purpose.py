"""agents purpose

Revision ID: e2d3c4b5a6f8
Revises: b9c8d7e6f5a4
Create Date: 2026-02-11

"""

from alembic import op
import sqlalchemy as sa


revision = "e2d3c4b5a6f8"
down_revision = "b9c8d7e6f5a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("purpose", sa.String(length=32), server_default=sa.text("'general'"), nullable=False),
    )
    op.create_check_constraint(
        "ck_agents_purpose",
        "agents",
        "purpose IN ("
        "'storyboard_extraction',"
        "'asset_extraction',"
        "'scene_creation',"
        "'prop_creation',"
        "'character_creation',"
        "'vfx_creation',"
        "'general'"
        ")",
    )
    op.create_index("idx_agents_purpose", "agents", ["purpose"])


def downgrade() -> None:
    op.drop_index("idx_agents_purpose", table_name="agents")
    op.drop_constraint("ck_agents_purpose", "agents", type_="check")
    op.drop_column("agents", "purpose")

