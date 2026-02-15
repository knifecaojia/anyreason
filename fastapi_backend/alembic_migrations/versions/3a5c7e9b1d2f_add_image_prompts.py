"""add_image_prompts

Revision ID: 3a5c7e9b1d2f
Revises: 2d3e4f5a6b7c
Create Date: 2026-02-15 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "3a5c7e9b1d2f"
down_revision = "2d3e4f5a6b7c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "image_prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "storyboard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("storyboards.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("prompt_main", sa.Text(), nullable=True),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        sa.Column("style_model", sa.String(length=50), nullable=True),
        sa.Column("aspect_ratio", sa.String(length=10), nullable=True),
        sa.Column("character_prompts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("camera_settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("generation_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_image_prompts_storyboard", "image_prompts", ["storyboard_id"])


def downgrade():
    op.drop_index("idx_image_prompts_storyboard", table_name="image_prompts")
    op.drop_table("image_prompts")

