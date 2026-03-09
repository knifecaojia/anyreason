"""canvas_node_type add imageOutputNode videoOutputNode groupNode + add updated_at column

Revision ID: a1b2c3d4e5f6
Revises: m21_fix_canvas_tables
Create Date: 2026-03-02

"""
import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "m21_fix_canvas_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_canvas_nodes_node_type", "canvas_nodes", type_="check")
    op.create_check_constraint(
        "ck_canvas_nodes_node_type",
        "canvas_nodes",
        "node_type IN ("
        "'textNoteNode', 'scriptNode', 'storyboardNode', "
        "'textGenNode', 'generatorNode', 'slicerNode', 'candidateNode', 'assetNode', "
        "'imageOutputNode', 'videoOutputNode', 'groupNode'"
        ")",
    )


def downgrade() -> None:
    op.drop_column("canvas_nodes", "updated_at")
    op.drop_constraint("ck_canvas_nodes_node_type", "canvas_nodes", type_="check")
    op.create_check_constraint(
        "ck_canvas_nodes_node_type",
        "canvas_nodes",
        "node_type IN ("
        "'textNoteNode', 'scriptNode', 'storyboardNode', "
        "'textGenNode', 'generatorNode', 'slicerNode', 'candidateNode', 'assetNode'"
        ")",
    )
