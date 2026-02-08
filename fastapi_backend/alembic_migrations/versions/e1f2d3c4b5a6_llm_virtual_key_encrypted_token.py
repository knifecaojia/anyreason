"""LLM virtual key encrypted token

Revision ID: e1f2d3c4b5a6
Revises: d8e7c6b5a4f3
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e1f2d3c4b5a6"
down_revision: Union[str, None] = "d8e7c6b5a4f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("llm_virtual_keys", sa.Column("encrypted_token", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("llm_virtual_keys", "encrypted_token")

