"""add_plaintext_api_key_and_multi_keys

Revision ID: ddef79f74f17
Revises: c3d4e5f6a7b8
Create Date: 2026-03-14 20:47:27.208224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'ddef79f74f17'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new columns
    op.add_column('ai_model_configs', sa.Column('plaintext_api_key', sa.Text(), nullable=True))
    op.add_column('ai_model_configs', sa.Column('api_keys_info', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # 2. Data migration: Decrypt existing encrypted_api_key into plaintext_api_key
    # Note: We use raw connection and local imports to avoid issues with app lifecycle
    try:
        from app.config import settings
        from app.crypto import build_fernet
        
        fernet = build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))
        
        connection = op.get_bind()
        # Fetch existing rows with encrypted keys
        res = connection.execute(sa.text("SELECT id, encrypted_api_key FROM ai_model_configs WHERE encrypted_api_key IS NOT NULL"))
        rows = res.fetchall()
        
        for row in rows:
            config_id, encrypted_val = row
            if not encrypted_val:
                continue
            try:
                # Decrypt
                decrypted_key = fernet.decrypt(encrypted_val).decode("utf-8")
                # Update plaintext column
                connection.execute(
                    sa.text("UPDATE ai_model_configs SET plaintext_api_key = :key WHERE id = :id"),
                    {"key": decrypted_key, "id": config_id}
                )
            except Exception as e:
                print(f"Warning: Failed to decrypt key for AIModelConfig {config_id}: {e}")
    except ImportError:
        print("Warning: Could not import app modules for data migration. Skipping decryption step.")
    except Exception as e:
        print(f"Warning: Data migration failed: {e}")


def downgrade() -> None:
    op.drop_column('ai_model_configs', 'api_keys_info')
    op.drop_column('ai_model_configs', 'plaintext_api_key')
