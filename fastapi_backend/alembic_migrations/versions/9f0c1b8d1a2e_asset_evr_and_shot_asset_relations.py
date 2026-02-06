"""Asset EVR model and shot-asset relations

Revision ID: 9f0c1b8d1a2e
Revises: 7c2f0f2a1d9e
Create Date: 2026-02-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "9f0c1b8d1a2e"
down_revision: Union[str, None] = "7c2f0f2a1d9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column(
            "lifecycle_status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
    )
    op.create_check_constraint(
        "ck_assets_lifecycle_status",
        "assets",
        "lifecycle_status IN ('draft', 'published', 'archived')",
    )

    op.add_column("episodes", sa.Column("stage_tag", sa.String(length=50), nullable=True))

    op.create_table(
        "asset_variants",
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
        sa.Column("variant_code", sa.String(length=50), nullable=False),
        sa.Column("stage_tag", sa.String(length=50), nullable=True),
        sa.Column("age_range", sa.String(length=50), nullable=True),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("prompt_template", sa.Text(), nullable=True),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "asset_entity_id",
            "variant_code",
            name="uq_asset_variants_asset_entity_variant_code",
        ),
    )
    op.create_index("idx_asset_variants_asset", "asset_variants", ["asset_entity_id"], unique=False)
    op.create_index(
        "idx_asset_variants_stage",
        "asset_variants",
        ["asset_entity_id", "stage_tag"],
        unique=False,
    )

    op.create_table(
        "asset_resources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("asset_variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("res_type", sa.String(length=50), nullable=False),
        sa.Column("minio_bucket", sa.String(length=255), nullable=False),
        sa.Column("minio_key", sa.Text(), nullable=False),
        sa.Column(
            "meta_data",
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
    )
    op.create_index("idx_asset_resources_variant", "asset_resources", ["variant_id"], unique=False)
    op.create_index(
        "idx_asset_resources_type",
        "asset_resources",
        ["variant_id", "res_type"],
        unique=False,
    )

    op.create_table(
        "shot_asset_relations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shots.id", ondelete="CASCADE"),
            nullable=False,
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
        sa.UniqueConstraint(
            "shot_id",
            "asset_entity_id",
            name="uq_shot_asset_relations_shot_asset",
        ),
    )
    op.create_index(
        "idx_shot_asset_relations_asset",
        "shot_asset_relations",
        ["asset_entity_id"],
        unique=False,
    )
    op.create_index(
        "idx_shot_asset_relations_shot",
        "shot_asset_relations",
        ["shot_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO asset_variants (
            id,
            asset_entity_id,
            variant_code,
            stage_tag,
            age_range,
            attributes,
            prompt_template,
            is_default,
            created_at
        )
        SELECT
            gen_random_uuid(),
            a.id,
            'V1',
            NULL,
            NULL,
            COALESCE(a.visual_features, '{}'::jsonb),
            a.prompt_template,
            true,
            COALESCE(a.created_at, now())
        FROM assets a
        """
    )

    op.execute(
        """
        INSERT INTO shot_asset_relations (
            id,
            shot_id,
            asset_entity_id,
            asset_variant_id,
            state,
            created_at
        )
        SELECT
            gen_random_uuid(),
            sh.id,
            a.id,
            NULL,
            '{}'::jsonb,
            COALESCE(sh.created_at, now())
        FROM shots sh
        JOIN scenes sc ON sc.id = sh.scene_id
        JOIN episodes ep ON ep.id = sc.episode_id
        JOIN LATERAL jsonb_array_elements_text(COALESCE(sh.active_assets, '[]'::jsonb)) AS asset_code(code) ON true
        JOIN assets a ON a.project_id = ep.project_id AND a.asset_id = asset_code.code
        ON CONFLICT (shot_id, asset_entity_id) DO NOTHING
        """
    )

    op.drop_column("assets", "visual_features")
    op.drop_column("assets", "appearances")
    op.drop_column("assets", "first_appearance_ref")
    op.drop_column("assets", "prompt_template")


def downgrade() -> None:
    op.add_column(
        "assets",
        sa.Column(
            "visual_features",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "assets",
        sa.Column(
            "appearances",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "assets",
        sa.Column("first_appearance_ref", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("prompt_template", sa.Text(), nullable=True),
    )

    op.execute(
        """
        UPDATE assets a
        SET
            visual_features = av.attributes,
            prompt_template = av.prompt_template
        FROM asset_variants av
        WHERE av.asset_entity_id = a.id
          AND (av.is_default = true OR av.variant_code = 'V1')
        """
    )

    op.drop_index("idx_shot_asset_relations_shot", table_name="shot_asset_relations")
    op.drop_index("idx_shot_asset_relations_asset", table_name="shot_asset_relations")
    op.drop_table("shot_asset_relations")

    op.drop_index("idx_asset_resources_type", table_name="asset_resources")
    op.drop_index("idx_asset_resources_variant", table_name="asset_resources")
    op.drop_table("asset_resources")

    op.drop_index("idx_asset_variants_stage", table_name="asset_variants")
    op.drop_index("idx_asset_variants_asset", table_name="asset_variants")
    op.drop_table("asset_variants")

    op.drop_column("episodes", "stage_tag")

    op.drop_constraint("ck_assets_lifecycle_status", "assets", type_="check")
    op.drop_column("assets", "lifecycle_status")

