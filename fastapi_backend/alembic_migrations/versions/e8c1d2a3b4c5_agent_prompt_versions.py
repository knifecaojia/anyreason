"""agent_prompt_versions

Revision ID: e8c1d2a3b4c5
Revises: fedcba987654
Create Date: 2026-02-13 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e8c1d2a3b4c5"
down_revision = "fedcba987654"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_prompt_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("user_prompt_template", sa.Text(), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_id", "version", name="uq_agent_prompt_versions_agent_version"),
    )

    op.create_index(
        "uq_agent_prompt_versions_default",
        "agent_prompt_versions",
        ["agent_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    op.create_index("idx_agent_prompt_versions_agent", "agent_prompt_versions", ["agent_id"], unique=False)
    op.create_index("idx_agent_prompt_versions_created_at", "agent_prompt_versions", ["created_at"], unique=False)


def downgrade():
    op.drop_index("idx_agent_prompt_versions_created_at", table_name="agent_prompt_versions")
    op.drop_index("idx_agent_prompt_versions_agent", table_name="agent_prompt_versions")
    op.drop_index("uq_agent_prompt_versions_default", table_name="agent_prompt_versions")
    op.drop_table("agent_prompt_versions")
