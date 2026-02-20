"""ai_model_test_image_run_files

Revision ID: 6e7f8a9b0c1d
Revises: 5d6e7f8a9b0c
Create Date: 2026-02-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "6e7f8a9b0c1d"
down_revision = "5d6e7f8a9b0c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_model_test_image_runs",
        sa.Column("input_file_node_ids", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.add_column(
        "ai_model_test_image_runs",
        sa.Column("output_file_node_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "ai_model_test_image_runs",
        sa.Column("output_content_type", sa.String(length=128), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_model_test_image_runs_output_file_node_id",
        "ai_model_test_image_runs",
        "file_nodes",
        ["output_file_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_ai_model_test_image_runs_output_node", "ai_model_test_image_runs", ["output_file_node_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_model_test_image_runs_output_node", table_name="ai_model_test_image_runs")
    op.drop_constraint("fk_ai_model_test_image_runs_output_file_node_id", "ai_model_test_image_runs", type_="foreignkey")
    op.drop_column("ai_model_test_image_runs", "output_content_type")
    op.drop_column("ai_model_test_image_runs", "output_file_node_id")
    op.drop_column("ai_model_test_image_runs", "input_file_node_ids")

