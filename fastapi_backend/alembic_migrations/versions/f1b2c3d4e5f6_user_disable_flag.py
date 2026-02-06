"""user disable flag

Revision ID: f1b2c3d4e5f6
Revises: e4a1c2d3f4b5
Create Date: 2026-02-06

"""

from alembic import op
import sqlalchemy as sa


revision = "f1b2c3d4e5f6"
down_revision = "e4a1c2d3f4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("user", "is_disabled")

