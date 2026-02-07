"""Asset bindings

Revision ID: 5b6c7d8e9f0a
Revises: 4c1d2e3f4a5b
Create Date: 2026-02-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "5b6c7d8e9f0a"
down_revision: Union[str, None] = "4c1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_bindings",
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
            "asset_variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("asset_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "episode_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("episodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "scene_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scenes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "shot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shots.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "state",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "((episode_id IS NOT NULL)::int + (scene_id IS NOT NULL)::int + (shot_id IS NOT NULL)::int) = 1",
            name="ck_asset_bindings_single_target",
        ),
        sa.UniqueConstraint(
            "shot_id",
            "asset_entity_id",
            name="uq_asset_bindings_shot_asset",
        ),
        sa.UniqueConstraint(
            "scene_id",
            "asset_entity_id",
            name="uq_asset_bindings_scene_asset",
        ),
        sa.UniqueConstraint(
            "episode_id",
            "asset_entity_id",
            name="uq_asset_bindings_episode_asset",
        ),
    )
    op.create_index("idx_asset_bindings_asset", "asset_bindings", ["asset_entity_id"], unique=False)
    op.create_index("idx_asset_bindings_episode", "asset_bindings", ["episode_id"], unique=False)
    op.create_index("idx_asset_bindings_scene", "asset_bindings", ["scene_id"], unique=False)
    op.create_index("idx_asset_bindings_shot", "asset_bindings", ["shot_id"], unique=False)

    op.execute(
        """
        INSERT INTO asset_bindings (asset_entity_id, asset_variant_id, shot_id, state, created_at)
        SELECT asset_entity_id, asset_variant_id, shot_id, state, created_at
        FROM shot_asset_relations
        """
    )


def downgrade() -> None:
    op.drop_index("idx_asset_bindings_shot", table_name="asset_bindings")
    op.drop_index("idx_asset_bindings_scene", table_name="asset_bindings")
    op.drop_index("idx_asset_bindings_episode", table_name="asset_bindings")
    op.drop_index("idx_asset_bindings_asset", table_name="asset_bindings")
    op.drop_table("asset_bindings")
