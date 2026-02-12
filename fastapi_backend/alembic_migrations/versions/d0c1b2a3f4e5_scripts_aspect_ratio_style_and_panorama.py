"""Scripts aspect ratio, style and panorama

Revision ID: d0c1b2a3f4e5
Revises: 9b8c7d6e5f4a
Create Date: 2026-02-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d0c1b2a3f4e5"
down_revision: Union[str, None] = "9b8c7d6e5f4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scripts", sa.Column("aspect_ratio", sa.String(length=16), nullable=True))
    op.add_column("scripts", sa.Column("animation_style", sa.String(length=64), nullable=True))
    op.add_column("scripts", sa.Column("panorama_minio_bucket", sa.String(length=255), nullable=True))
    op.add_column("scripts", sa.Column("panorama_minio_key", sa.Text(), nullable=True))
    op.add_column("scripts", sa.Column("panorama_original_filename", sa.String(length=255), nullable=True))
    op.add_column("scripts", sa.Column("panorama_content_type", sa.String(length=128), nullable=True))
    op.add_column(
        "scripts",
        sa.Column("panorama_size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("scripts", "panorama_size_bytes")
    op.drop_column("scripts", "panorama_content_type")
    op.drop_column("scripts", "panorama_original_filename")
    op.drop_column("scripts", "panorama_minio_key")
    op.drop_column("scripts", "panorama_minio_bucket")
    op.drop_column("scripts", "animation_style")
    op.drop_column("scripts", "aspect_ratio")

