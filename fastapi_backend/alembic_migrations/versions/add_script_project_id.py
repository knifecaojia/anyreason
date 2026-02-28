"""add script.project_id field

Revision ID: add_script_project_id
Revises: a028e9aa7278
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'add_script_project_id'
down_revision = 'a028e9aa7278'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'scripts',
        sa.Column(
            'project_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('projects.id', ondelete='SET NULL'),
            nullable=True
        )
    )
    op.create_index('idx_scripts_project', 'scripts', ['project_id'])
    
    # Data migration: ensure each Script has a corresponding Project
    # Step 1: Create missing Projects for Scripts
    op.execute("""
        INSERT INTO projects (id, owner_id, name, created_at)
        SELECT s.id, s.owner_id, COALESCE(s.title, 'Untitled'), s.created_at
        FROM scripts s
        WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = s.id)
        ON CONFLICT (id) DO NOTHING
    """)
    
    # Step 2: Update Script.project_id to point to the Project with same ID
    op.execute("""
        UPDATE scripts SET project_id = id WHERE project_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index('idx_scripts_project', table_name='scripts')
    op.drop_column('scripts', 'project_id')
