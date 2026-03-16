"""Expand batch video result_url columns to text

Revision ID: 1f2e3d4c5b6a
Revises: f1b2c3d4e5fa
Create Date: 2026-03-16 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1f2e3d4c5b6a'
down_revision: Union[str, None] = 'f1b2c3d4e5fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('batch_video_assets', 'result_url', existing_type=sa.String(length=512), type_=sa.Text(), existing_nullable=True)
    op.alter_column('batch_video_history', 'result_url', existing_type=sa.String(length=512), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('batch_video_history', 'result_url', existing_type=sa.Text(), type_=sa.String(length=512), existing_nullable=True)
    op.alter_column('batch_video_assets', 'result_url', existing_type=sa.Text(), type_=sa.String(length=512), existing_nullable=True)
