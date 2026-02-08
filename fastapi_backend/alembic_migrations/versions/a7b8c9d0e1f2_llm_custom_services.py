"""llm custom services

Revision ID: a7b8c9d0e1f2
Revises: e1f2d3c4b5a6
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "e1f2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_custom_services",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=32), server_default=sa.text("'openai_compatible'"), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("supported_models", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("created_models", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("encrypted_api_key", sa.LargeBinary(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('openai_compatible')", name="ck_llm_custom_services_kind"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_llm_custom_services_name"),
    )
    op.create_index("idx_llm_custom_services_created_at", "llm_custom_services", ["created_at"], unique=False)
    op.create_index("idx_llm_custom_services_enabled", "llm_custom_services", ["enabled"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_llm_custom_services_enabled", table_name="llm_custom_services")
    op.drop_index("idx_llm_custom_services_created_at", table_name="llm_custom_services")
    op.drop_table("llm_custom_services")

