"""Merge heads

Revision ID: 6c7d8e9f0a1b
Revises: 5b6c7d8e9f0a, f1b2c3d4e5f6
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "6c7d8e9f0a1b"
down_revision: Union[str, tuple[str, ...], None] = ("5b6c7d8e9f0a", "f1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SELECT 1")


def downgrade() -> None:
    op.execute("SELECT 1")
