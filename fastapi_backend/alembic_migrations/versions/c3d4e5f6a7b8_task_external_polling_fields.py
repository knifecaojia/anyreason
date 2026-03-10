"""tasks: add external polling fields for long-running video generation

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New columns for two-phase async external task polling
    op.add_column("tasks", sa.Column("external_task_id", sa.String(256), nullable=True))
    op.add_column("tasks", sa.Column("external_provider", sa.String(64), nullable=True))
    op.add_column("tasks", sa.Column("external_meta", postgresql.JSONB(), nullable=True))
    op.add_column("tasks", sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=True))

    # Update status check constraint to include 'waiting_external'
    op.drop_constraint("ck_tasks_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_status",
        "tasks",
        "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'waiting_external')",
    )

    # Partial index for efficient polling queries
    op.create_index(
        "idx_tasks_waiting_poll",
        "tasks",
        ["status", "next_poll_at"],
        postgresql_where=sa.text("status = 'waiting_external'"),
    )


def downgrade() -> None:
    op.drop_index("idx_tasks_waiting_poll", table_name="tasks")

    op.drop_constraint("ck_tasks_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_status",
        "tasks",
        "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')",
    )

    op.drop_column("tasks", "next_poll_at")
    op.drop_column("tasks", "external_meta")
    op.drop_column("tasks", "external_provider")
    op.drop_column("tasks", "external_task_id")
