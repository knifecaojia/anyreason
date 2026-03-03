"""M2.1: Fix canvas tables — remove project_id/episode_id FK, rename weak-ref cols,
add description/thumbnail_node_id, add textGenNode to CHECK constraint.

Revision ID: m21_fix_canvas_tables
Revises: merge_canvas_script_project
Create Date: 2026-03-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'm21_fix_canvas_tables'
down_revision = 'merge_canvas_script_project'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- canvases: remove project_id / episode_id (canvas is user-level) ---
    op.drop_index('idx_canvases_project_status', table_name='canvases')
    op.drop_index('idx_canvases_project', table_name='canvases')
    op.drop_index('idx_canvases_episode', table_name='canvases')
    op.drop_constraint('canvases_project_id_fkey', 'canvases', type_='foreignkey')
    op.drop_constraint('canvases_episode_id_fkey', 'canvases', type_='foreignkey')
    op.drop_column('canvases', 'project_id')
    op.drop_column('canvases', 'episode_id')

    # --- canvases: add description + thumbnail_node_id ---
    op.add_column('canvases', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('canvases', sa.Column(
        'thumbnail_node_id',
        postgresql.UUID(as_uuid=True),
        nullable=True,
    ))
    op.create_foreign_key(
        'canvases_thumbnail_node_id_fkey', 'canvases',
        'file_nodes', ['thumbnail_node_id'], ['id'],
        ondelete='SET NULL',
    )

    # --- canvases: add composite index for user+status ---
    op.create_index('idx_canvases_user_status', 'canvases', ['user_id', 'status'], unique=False)

    # --- canvas_nodes: rename storyboard_id → source_storyboard_id (drop FK) ---
    op.drop_index('idx_canvas_nodes_storyboard', table_name='canvas_nodes')
    op.drop_constraint('canvas_nodes_storyboard_id_fkey', 'canvas_nodes', type_='foreignkey')
    op.alter_column('canvas_nodes', 'storyboard_id', new_column_name='source_storyboard_id')
    op.create_index('idx_canvas_nodes_source_storyboard', 'canvas_nodes', ['source_storyboard_id'], unique=False)

    # --- canvas_nodes: rename asset_id → source_asset_id (drop FK) ---
    op.drop_index('idx_canvas_nodes_asset', table_name='canvas_nodes')
    op.drop_constraint('canvas_nodes_asset_id_fkey', 'canvas_nodes', type_='foreignkey')
    op.alter_column('canvas_nodes', 'asset_id', new_column_name='source_asset_id')
    op.create_index('idx_canvas_nodes_source_asset', 'canvas_nodes', ['source_asset_id'], unique=False)

    # --- canvas_nodes: update CHECK constraint to include textGenNode ---
    op.drop_constraint('ck_canvas_nodes_node_type', 'canvas_nodes', type_='check')
    op.create_check_constraint(
        'ck_canvas_nodes_node_type', 'canvas_nodes',
        "node_type IN ('textNoteNode', 'scriptNode', 'storyboardNode', "
        "'textGenNode', 'generatorNode', 'slicerNode', 'candidateNode', 'assetNode')",
    )


def downgrade() -> None:
    # --- canvas_nodes: revert CHECK constraint ---
    op.drop_constraint('ck_canvas_nodes_node_type', 'canvas_nodes', type_='check')
    op.create_check_constraint(
        'ck_canvas_nodes_node_type', 'canvas_nodes',
        "node_type IN ('textNoteNode', 'scriptNode', 'storyboardNode', "
        "'generatorNode', 'slicerNode', 'candidateNode', 'assetNode')",
    )

    # --- canvas_nodes: revert source_asset_id → asset_id (re-add FK) ---
    op.drop_index('idx_canvas_nodes_source_asset', table_name='canvas_nodes')
    op.alter_column('canvas_nodes', 'source_asset_id', new_column_name='asset_id')
    op.create_foreign_key(
        'canvas_nodes_asset_id_fkey', 'canvas_nodes',
        'assets', ['asset_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('idx_canvas_nodes_asset', 'canvas_nodes', ['asset_id'], unique=False)

    # --- canvas_nodes: revert source_storyboard_id → storyboard_id (re-add FK) ---
    op.drop_index('idx_canvas_nodes_source_storyboard', table_name='canvas_nodes')
    op.alter_column('canvas_nodes', 'source_storyboard_id', new_column_name='storyboard_id')
    op.create_foreign_key(
        'canvas_nodes_storyboard_id_fkey', 'canvas_nodes',
        'storyboards', ['storyboard_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('idx_canvas_nodes_storyboard', 'canvas_nodes', ['storyboard_id'], unique=False)

    # --- canvases: drop new index and columns ---
    op.drop_index('idx_canvases_user_status', table_name='canvases')
    op.drop_constraint('canvases_thumbnail_node_id_fkey', 'canvases', type_='foreignkey')
    op.drop_column('canvases', 'thumbnail_node_id')
    op.drop_column('canvases', 'description')

    # --- canvases: re-add project_id / episode_id ---
    op.add_column('canvases', sa.Column(
        'project_id', postgresql.UUID(as_uuid=True), nullable=True,
    ))
    op.add_column('canvases', sa.Column(
        'episode_id', postgresql.UUID(as_uuid=True), nullable=True,
    ))
    op.create_foreign_key(
        'canvases_project_id_fkey', 'canvases',
        'projects', ['project_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_foreign_key(
        'canvases_episode_id_fkey', 'canvases',
        'episodes', ['episode_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('idx_canvases_episode', 'canvases', ['episode_id'], unique=False)
    op.create_index('idx_canvases_project', 'canvases', ['project_id'], unique=False)
    op.create_index('idx_canvases_project_status', 'canvases', ['project_id', 'status'], unique=False)
