"""agent_platform_tables

Revision ID: 1234abcd5678
Revises: ffffffffffff
Create Date: 2026-02-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "1234abcd5678"
down_revision = "ffffffffffff"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "builtin_agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("agent_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("default_ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tools", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["default_ai_model_config_id"], ["ai_model_configs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_code", name="uq_builtin_agents_agent_code"),
    )
    op.create_index("idx_builtin_agents_category", "builtin_agents", ["category"], unique=False)
    op.create_index("idx_builtin_agents_model_config", "builtin_agents", ["default_ai_model_config_id"], unique=False)

    op.create_table(
        "builtin_agent_prompt_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("builtin_agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.ForeignKeyConstraint(["builtin_agent_id"], ["builtin_agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("builtin_agent_id", "version", name="uq_builtin_agent_prompt_versions_agent_version"),
    )
    op.create_index("idx_builtin_agent_prompt_versions_agent", "builtin_agent_prompt_versions", ["builtin_agent_id"], unique=False)
    op.create_index("idx_builtin_agent_prompt_versions_created_at", "builtin_agent_prompt_versions", ["created_at"], unique=False)
    op.create_index(
        "uq_builtin_agent_prompt_versions_default",
        "builtin_agent_prompt_versions",
        ["builtin_agent_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    op.create_table(
        "builtin_agent_user_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("builtin_agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["builtin_agent_id"], ["builtin_agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("builtin_agent_id", "user_id", name="uq_builtin_agent_user_overrides_agent_user"),
    )
    op.create_index("idx_builtin_agent_user_overrides_user", "builtin_agent_user_overrides", ["user_id"], unique=False)

    op.create_table(
        "scenes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("scene_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("builtin_agent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("required_tools", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("output_schema", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("ui_config", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["builtin_agent_id"], ["builtin_agents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scene_code", name="uq_scenes_scene_code"),
    )
    op.create_index("idx_scenes_type", "scenes", ["type"], unique=False)
    op.create_index("idx_scenes_builtin_agent", "scenes", ["builtin_agent_id"], unique=False)

    op.create_table(
        "user_agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agent_code", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("base_builtin_agent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("ai_model_config_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("temperature", sa.Numeric(), nullable=True),
        sa.Column("tools", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ai_model_config_id"], ["ai_model_configs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["base_builtin_agent_id"], ["builtin_agents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_agents_user", "user_agents", ["user_id"], unique=False)
    op.create_index("idx_user_agents_workspace", "user_agents", ["workspace_id"], unique=False)
    op.create_index("idx_user_agents_public", "user_agents", ["is_public"], unique=False)

    op.create_table(
        "user_apps",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=128), nullable=True),
        sa.Column("flow_definition", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("trigger_type", sa.String(length=32), server_default=sa.text("'manual'"), nullable=False),
        sa.Column("input_template", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("output_template", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_apps_user", "user_apps", ["user_id"], unique=False)
    op.create_index("idx_user_apps_workspace", "user_apps", ["workspace_id"], unique=False)
    op.create_index("idx_user_apps_active", "user_apps", ["is_active"], unique=False)


def downgrade():
    op.drop_index("idx_user_apps_active", table_name="user_apps")
    op.drop_index("idx_user_apps_workspace", table_name="user_apps")
    op.drop_index("idx_user_apps_user", table_name="user_apps")
    op.drop_table("user_apps")

    op.drop_index("idx_user_agents_public", table_name="user_agents")
    op.drop_index("idx_user_agents_workspace", table_name="user_agents")
    op.drop_index("idx_user_agents_user", table_name="user_agents")
    op.drop_table("user_agents")

    op.drop_index("idx_scenes_builtin_agent", table_name="scenes")
    op.drop_index("idx_scenes_type", table_name="scenes")
    op.drop_table("scenes")

    op.drop_index("idx_builtin_agent_user_overrides_user", table_name="builtin_agent_user_overrides")
    op.drop_table("builtin_agent_user_overrides")

    op.drop_index("uq_builtin_agent_prompt_versions_default", table_name="builtin_agent_prompt_versions")
    op.drop_index("idx_builtin_agent_prompt_versions_created_at", table_name="builtin_agent_prompt_versions")
    op.drop_index("idx_builtin_agent_prompt_versions_agent", table_name="builtin_agent_prompt_versions")
    op.drop_table("builtin_agent_prompt_versions")

    op.drop_index("idx_builtin_agents_model_config", table_name="builtin_agents")
    op.drop_index("idx_builtin_agents_category", table_name="builtin_agents")
    op.drop_table("builtin_agents")

