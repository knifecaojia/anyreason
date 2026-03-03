"""merge heads abc123canvas001 and add_script_project_id

Revision ID: merge_canvas_script_project
Revises: abc123canvas001, add_script_project_id
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'merge_canvas_script_project'
down_revision = ('abc123canvas001', 'add_script_project_id')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
