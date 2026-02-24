"""spec06: asset_variants.doc_node_id for variant markdown binding

Revision ID: 001_spec06_variant_doc
Revises: 37821a04fec6
Create Date: 2026-02-23

"""

from alembic import op
import sqlalchemy as sa


revision = "001_spec06_variant_doc"
down_revision = "37821a04fec6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "asset_variants",
        sa.Column("doc_node_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_asset_variants_doc_node_id",
        "asset_variants",
        "file_nodes",
        ["doc_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_asset_variants_doc_node",
        "asset_variants",
        ["doc_node_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_asset_variants_doc_node", table_name="asset_variants")
    op.drop_constraint("fk_asset_variants_doc_node_id", "asset_variants", type_="foreignkey")
    op.drop_column("asset_variants", "doc_node_id")
