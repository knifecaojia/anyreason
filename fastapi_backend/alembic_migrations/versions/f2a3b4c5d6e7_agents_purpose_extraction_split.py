"""agents purpose extraction split

Revision ID: f2a3b4c5d6e7
Revises: e2d3c4b5a6f8
Create Date: 2026-02-11

"""

from alembic import op


revision = "f2a3b4c5d6e7"
down_revision = "e2d3c4b5a6f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_agents_purpose", "agents", type_="check")
    op.create_check_constraint(
        "ck_agents_purpose",
        "agents",
        "purpose IN ("
        "'storyboard_extraction',"
        "'asset_extraction',"
        "'scene_extraction',"
        "'character_extraction',"
        "'prop_extraction',"
        "'vfx_extraction',"
        "'scene_creation',"
        "'prop_creation',"
        "'character_creation',"
        "'vfx_creation',"
        "'general'"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint("ck_agents_purpose", "agents", type_="check")
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

