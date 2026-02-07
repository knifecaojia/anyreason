"""Add scripts table

Revision ID: 3d4e5f6a7b8c
Revises: 2ab7f3f1e2d4
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "3d4e5f6a7b8c"
down_revision: Union[str, None] = "2ab7f3f1e2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scripts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("minio_bucket", sa.String(length=255), nullable=False),
        sa.Column("minio_key", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column(
            "size_bytes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index("idx_scripts_owner", "scripts", ["owner_id"])
    op.create_index("idx_scripts_owner_created_at", "scripts", ["owner_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_scripts_owner_created_at", table_name="scripts")
    op.drop_index("idx_scripts_owner", table_name="scripts")
    op.drop_table("scripts")

