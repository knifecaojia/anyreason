"""Scripts panorama thumbnails

Revision ID: f0a1b2c3d4e6
Revises: e1a2b3c4d5f6
Create Date: 2026-02-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f0a1b2c3d4e6"
down_revision: Union[str, None] = "e1a2b3c4d5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scripts", sa.Column("panorama_thumb_minio_bucket", sa.String(length=255), nullable=True))
    op.add_column("scripts", sa.Column("panorama_thumb_minio_key", sa.Text(), nullable=True))
    op.add_column("scripts", sa.Column("panorama_thumb_content_type", sa.String(length=128), nullable=True))
    op.add_column(
        "scripts",
        sa.Column("panorama_thumb_size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("scripts", "panorama_thumb_size_bytes")
    op.drop_column("scripts", "panorama_thumb_content_type")
    op.drop_column("scripts", "panorama_thumb_minio_key")
    op.drop_column("scripts", "panorama_thumb_minio_bucket")

