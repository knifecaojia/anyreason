"""spec06: asset_resources.is_cover column with partial unique index

Revision ID: 002_spec06_resource_cover
Revises: 001_spec06_variant_doc
Create Date: 2026-02-23

"""

from alembic import op
import sqlalchemy as sa


revision = "002_spec06_resource_cover"
down_revision = "001_spec06_variant_doc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "asset_resources",
        sa.Column("is_cover", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_asset_variant_cover
        ON asset_resources (variant_id)
        WHERE is_cover = TRUE
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_asset_variant_cover")
    op.drop_column("asset_resources", "is_cover")
