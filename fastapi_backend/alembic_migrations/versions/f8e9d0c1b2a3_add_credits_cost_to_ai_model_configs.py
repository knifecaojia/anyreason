"""
add_credits_cost_to_ai_model_configs

Revision ID: f8e9d0c1b2a3
Revises: add7f8b9c0e1
Create Date: 2026-03-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8e9d0c1b2a3'
down_revision: Union[str, None] = 'add7f8b9c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_model_configs', sa.Column('credits_cost', sa.Integer(), server_default=sa.text('0'), nullable=False))


def downgrade() -> None:
    op.drop_column('ai_model_configs', 'credits_cost')
