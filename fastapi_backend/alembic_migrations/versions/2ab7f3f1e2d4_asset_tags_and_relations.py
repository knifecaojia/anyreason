"""Asset tags and relations

Revision ID: 2ab7f3f1e2d4
Revises: 9f0c1b8d1a2e
Create Date: 2026-02-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "2ab7f3f1e2d4"
down_revision: Union[str, None] = "9f0c1b8d1a2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_asset_tags_project_name"),
    )
    op.create_index("idx_asset_tags_project", "asset_tags", ["project_id"], unique=False)

    op.create_table(
        "asset_tag_relations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "asset_entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("asset_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "asset_entity_id",
            "tag_id",
            name="uq_asset_tag_relations_asset_tag",
        ),
    )
    op.create_index(
        "idx_asset_tag_relations_asset",
        "asset_tag_relations",
        ["asset_entity_id"],
        unique=False,
    )
    op.create_index(
        "idx_asset_tag_relations_tag",
        "asset_tag_relations",
        ["tag_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_asset_tag_relations_tag", table_name="asset_tag_relations")
    op.drop_index("idx_asset_tag_relations_asset", table_name="asset_tag_relations")
    op.drop_table("asset_tag_relations")

    op.drop_index("idx_asset_tags_project", table_name="asset_tags")
    op.drop_table("asset_tags")

