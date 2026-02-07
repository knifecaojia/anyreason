"""Scripts soft delete

Revision ID: 8a1b2c3d4e5f
Revises: 6c7d8e9f0a1b
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "8a1b2c3d4e5f"
down_revision: Union[str, None] = "6c7d8e9f0a1b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scripts",
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("scripts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "idx_scripts_owner_is_deleted_created_at",
        "scripts",
        ["owner_id", "is_deleted", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_scripts_owner_is_deleted_created_at", table_name="scripts")
    op.drop_column("scripts", "deleted_at")
    op.drop_column("scripts", "is_deleted")
