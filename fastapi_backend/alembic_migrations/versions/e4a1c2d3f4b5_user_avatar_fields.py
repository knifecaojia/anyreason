"""user avatar fields

Revision ID: e4a1c2d3f4b5
Revises: d3f1a9c7b2e1
Create Date: 2026-02-06

"""

from alembic import op
import sqlalchemy as sa


revision = "e4a1c2d3f4b5"
down_revision = "d3f1a9c7b2e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("avatar_content_type", sa.String(length=128), nullable=True))
    op.add_column("user", sa.Column("avatar_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "avatar_data")
    op.drop_column("user", "avatar_content_type")

