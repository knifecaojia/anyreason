"""episode_doc_node_id

Revision ID: 2d3e4f5a6b7c
Revises: f7a6b5c4d3e2
Create Date: 2026-02-14 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "2d3e4f5a6b7c"
down_revision = "f7a6b5c4d3e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "episodes",
        sa.Column("episode_doc_node_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_episodes_episode_doc_node_id",
        "episodes",
        "file_nodes",
        ["episode_doc_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_episodes_episode_doc_node_id",
        "episodes",
        ["episode_doc_node_id"],
    )


def downgrade():
    op.drop_index("idx_episodes_episode_doc_node_id", table_name="episodes")
    op.drop_constraint("fk_episodes_episode_doc_node_id", "episodes", type_="foreignkey")
    op.drop_column("episodes", "episode_doc_node_id")
