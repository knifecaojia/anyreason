"""agents_bind_ai_model_configs

Revision ID: cc33dd44ee55
Revises: bb22cc33dd44
Create Date: 2026-02-12 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "cc33dd44ee55"
down_revision = "bb22cc33dd44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=False))
    op.create_foreign_key(
        "fk_agents_ai_model_config_id",
        "agents",
        "ai_model_configs",
        ["ai_model_config_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.drop_constraint("ck_agents_category", "agents", type_="check")
    op.create_check_constraint("ck_agents_category", "agents", "category IN ('text','image','video')")

    op.drop_column("agents", "channel")
    op.drop_column("agents", "provider")
    op.drop_column("agents", "model_id")

    op.create_index("idx_agents_model_config", "agents", ["ai_model_config_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_agents_model_config", table_name="agents")

    op.add_column("agents", sa.Column("model_id", sa.String(length=128), nullable=False))
    op.add_column("agents", sa.Column("provider", sa.String(length=32), nullable=False))
    op.add_column("agents", sa.Column("channel", sa.String(length=32), server_default=sa.text("'system_litellm'"), nullable=False))

    op.drop_constraint("ck_agents_category", "agents", type_="check")
    op.create_check_constraint("ck_agents_category", "agents", "category IN ('dialogue','image','audio','video')")

    op.drop_constraint("fk_agents_ai_model_config_id", "agents", type_="foreignkey")
    op.drop_column("agents", "ai_model_config_id")

