"""add canvas tables

Revision ID: abc123canvas001
Revises: 9b8c7d6e5f4a
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'abc123canvas001'
down_revision = '9b8c7d6e5f4a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE canvas_status_enum AS ENUM ('draft', 'active', 'archived')")
    op.execute("CREATE TYPE canvas_node_status_enum AS ENUM ('pending', 'running', 'completed', 'failed')")
    op.execute("CREATE TYPE canvas_execution_status_enum AS ENUM ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled')")
    op.execute("CREATE TYPE canvas_trigger_type_enum AS ENUM ('manual', 'batch', 'auto')")

    op.create_table(
        'canvases',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('episode_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', postgresql.ENUM('draft', 'active', 'archived', name='canvas_status_enum', create_type=False), server_default=sa.text("'draft'"), nullable=False),
        sa.Column('canvas_json_node_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('node_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['episode_id'], ['episodes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['canvas_json_node_id'], ['file_nodes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_canvases_project', 'canvases', ['project_id'], unique=False)
    op.create_index('idx_canvases_episode', 'canvases', ['episode_id'], unique=False)
    op.create_index('idx_canvases_user', 'canvases', ['user_id'], unique=False)
    op.create_index('idx_canvases_status', 'canvases', ['status'], unique=False)
    op.create_index('idx_canvases_project_status', 'canvases', ['project_id', 'status'], unique=False)

    op.create_table(
        'canvas_nodes',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('canvas_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('frontend_node_id', sa.String(length=64), nullable=False),
        sa.Column('node_type', sa.String(length=32), nullable=False),
        sa.Column('storyboard_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('asset_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('config_json', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('status', postgresql.ENUM('pending', 'running', 'completed', 'failed', name='canvas_node_status_enum', create_type=False), server_default=sa.text("'pending'"), nullable=False),
        sa.Column('last_task_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('output_file_node_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['canvas_id'], ['canvases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['storyboard_id'], ['storyboards.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['last_task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['output_file_node_id'], ['file_nodes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('canvas_id', 'frontend_node_id', name='uq_canvas_nodes_canvas_frontend_id'),
        sa.CheckConstraint(
            "node_type IN ('textNoteNode', 'scriptNode', 'storyboardNode', 'generatorNode', 'slicerNode', 'candidateNode', 'assetNode')",
            name='ck_canvas_nodes_node_type',
        ),
    )
    op.create_index('idx_canvas_nodes_canvas', 'canvas_nodes', ['canvas_id'], unique=False)
    op.create_index('idx_canvas_nodes_type', 'canvas_nodes', ['node_type'], unique=False)
    op.create_index('idx_canvas_nodes_status', 'canvas_nodes', ['status'], unique=False)
    op.create_index('idx_canvas_nodes_storyboard', 'canvas_nodes', ['storyboard_id'], unique=False)
    op.create_index('idx_canvas_nodes_asset', 'canvas_nodes', ['asset_id'], unique=False)

    op.create_table(
        'canvas_executions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('canvas_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('trigger_type', postgresql.ENUM('manual', 'batch', 'auto', name='canvas_trigger_type_enum', create_type=False), server_default=sa.text("'manual'"), nullable=False),
        sa.Column('status', postgresql.ENUM('pending', 'running', 'completed', 'partial', 'failed', 'cancelled', name='canvas_execution_status_enum', create_type=False), server_default=sa.text("'pending'"), nullable=False),
        sa.Column('total_nodes', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('completed_nodes', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('result_summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['canvas_id'], ['canvases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_canvas_executions_canvas', 'canvas_executions', ['canvas_id'], unique=False)
    op.create_index('idx_canvas_executions_status', 'canvas_executions', ['status'], unique=False)
    op.create_index('idx_canvas_executions_canvas_status', 'canvas_executions', ['canvas_id', 'status'], unique=False)
    op.create_index('idx_canvas_executions_created', 'canvas_executions', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_canvas_executions_created', table_name='canvas_executions')
    op.drop_index('idx_canvas_executions_canvas_status', table_name='canvas_executions')
    op.drop_index('idx_canvas_executions_status', table_name='canvas_executions')
    op.drop_index('idx_canvas_executions_canvas', table_name='canvas_executions')
    op.drop_table('canvas_executions')

    op.drop_index('idx_canvas_nodes_asset', table_name='canvas_nodes')
    op.drop_index('idx_canvas_nodes_storyboard', table_name='canvas_nodes')
    op.drop_index('idx_canvas_nodes_status', table_name='canvas_nodes')
    op.drop_index('idx_canvas_nodes_type', table_name='canvas_nodes')
    op.drop_index('idx_canvas_nodes_canvas', table_name='canvas_nodes')
    op.drop_table('canvas_nodes')

    op.drop_index('idx_canvases_project_status', table_name='canvases')
    op.drop_index('idx_canvases_status', table_name='canvases')
    op.drop_index('idx_canvases_user', table_name='canvases')
    op.drop_index('idx_canvases_episode', table_name='canvases')
    op.drop_index('idx_canvases_project', table_name='canvases')
    op.drop_table('canvases')

    op.execute('DROP TYPE IF EXISTS canvas_trigger_type_enum')
    op.execute('DROP TYPE IF EXISTS canvas_execution_status_enum')
    op.execute('DROP TYPE IF EXISTS canvas_node_status_enum')
    op.execute('DROP TYPE IF EXISTS canvas_status_enum')
