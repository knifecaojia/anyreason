"""ai_models: add model_capabilities and category columns

Revision ID: a1b2c3d4e5f8
Revises: 002_spec06_resource_cover
Create Date: 2026-02-24

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a1b2c3d4e5f8"
down_revision = "002_spec06_resource_cover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 添加 model_capabilities JSONB 字段，默认值为空 JSON 对象
    op.add_column(
        "ai_models",
        sa.Column(
            "model_capabilities",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # 添加 category VARCHAR(16) 字段，允许值为 text、image、video
    op.add_column(
        "ai_models",
        sa.Column("category", sa.String(length=16), nullable=True),
    )

    # 创建 idx_ai_models_category 索引
    op.create_index("idx_ai_models_category", "ai_models", ["category"], unique=False)

    # 添加 CHECK 约束确保 category 值有效
    op.create_check_constraint(
        "ck_ai_models_category",
        "ai_models",
        "category IS NULL OR category IN ('text', 'image', 'video')",
    )


def downgrade() -> None:
    # 删除 CHECK 约束
    op.drop_constraint("ck_ai_models_category", "ai_models", type_="check")

    # 删除索引
    op.drop_index("idx_ai_models_category", table_name="ai_models")

    # 删除 category 字段
    op.drop_column("ai_models", "category")

    # 删除 model_capabilities 字段
    op.drop_column("ai_models", "model_capabilities")
