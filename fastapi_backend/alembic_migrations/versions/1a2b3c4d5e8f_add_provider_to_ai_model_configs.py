"""add provider to ai_model_configs

Revision ID: 1a2b3c4d5e8f
Revises: f8e9d0c1b2a3
Create Date: 2026-03-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1a2b3c4d5e8f"
down_revision: Union[str, None] = "f8e9d0c1b2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_model_configs", sa.Column("provider", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_model_configs", "provider")
