"""episode result roots

Revision ID: a1b2c3d4e5f7
Revises: f1b2c3d4e5f6
Create Date: 2026-02-11

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a1b2c3d4e5f7"
down_revision = "f1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("episodes", sa.Column("storyboard_root_node_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("episodes", sa.Column("asset_root_node_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_episodes_storyboard_root_node_id",
        "episodes",
        "file_nodes",
        ["storyboard_root_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_episodes_asset_root_node_id",
        "episodes",
        "file_nodes",
        ["asset_root_node_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_episodes_asset_root_node_id", "episodes", type_="foreignkey")
    op.drop_constraint("fk_episodes_storyboard_root_node_id", "episodes", type_="foreignkey")
    op.drop_column("episodes", "asset_root_node_id")
    op.drop_column("episodes", "storyboard_root_node_id")

