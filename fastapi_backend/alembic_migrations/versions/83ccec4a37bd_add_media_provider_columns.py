"""add_media_provider_columns

Revision ID: 83ccec4a37bd
Revises: fdad15920802
Create Date: 2026-02-22 17:39:02.745646

"""
from typing import Sequence, Union
import os
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
import fastapi_users_db_sqlalchemy


# revision identifiers, used by Alembic.
revision: str = '83ccec4a37bd'
down_revision: Union[str, None] = 'fdad15920802'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns
    op.add_column('ai_manufacturers', sa.Column('doc_url', sa.Text(), nullable=True))
    op.add_column('ai_models', sa.Column('param_schema', JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'))
    
    # Execute init SQL
    # Path is relative to this file: ../../../sql/init/vendor_model_init.sql
    try:
        file_path = os.path.join(os.path.dirname(__file__), '../../sql/init/vendor_model_init.sql')
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                sql = f.read()
                # Split by semicolon to execute statement by statement
                statements = [s.strip() for s in sql.split(';') if s.strip()]
                for statement in statements:
                    op.execute(statement)
        else:
            print(f"Warning: Init SQL file not found at {file_path}")
    except Exception as e:
        print(f"Warning: Failed to execute init SQL: {e}")


def downgrade() -> None:
    op.drop_column('ai_models', 'param_schema')
    op.drop_column('ai_manufacturers', 'doc_url')
