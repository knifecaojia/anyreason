"""Episode script full text

Revision ID: 4c1d2e3f4a5b
Revises: 3d4e5f6a7b8c
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4c1d2e3f4a5b"
down_revision: Union[str, None] = "3d4e5f6a7b8c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("episodes", sa.Column("script_full_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("episodes", "script_full_text")
