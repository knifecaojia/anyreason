"""builtin_prompt_version_model_config

Revision ID: f7a6b5c4d3e2
Revises: e8c1d2a3b4c5
Create Date: 2026-02-13 12:30:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f7a6b5c4d3e2"
down_revision = "e8c1d2a3b4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "builtin_agent_prompt_versions",
        sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_builtin_agent_prompt_versions_ai_model_config_id",
        "builtin_agent_prompt_versions",
        "ai_model_configs",
        ["ai_model_config_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_builtin_agent_prompt_versions_model_config",
        "builtin_agent_prompt_versions",
        ["ai_model_config_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("idx_builtin_agent_prompt_versions_model_config", table_name="builtin_agent_prompt_versions")
    op.drop_constraint(
        "fk_builtin_agent_prompt_versions_ai_model_config_id",
        "builtin_agent_prompt_versions",
        type_="foreignkey",
    )
    op.drop_column("builtin_agent_prompt_versions", "ai_model_config_id")

