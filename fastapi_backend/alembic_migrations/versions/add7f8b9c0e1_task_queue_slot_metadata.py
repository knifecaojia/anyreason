"""tasks: add queue slot metadata columns and update status constraint

Revision ID: add7f8b9c0e1
Revises: 1f2e3d4c5b6a
Create Date: 2026-03-19

Adds columns for video slot queue lifecycle tracking:
- queue_position: position in the queue (when status='queued_for_slot')
- queued_at: when task entered the queue
- slot_owner_token: token proving slot ownership (when slot acquired)
- slot_config_id: which API key config's slot was acquired
- slot_acquired_at: when the slot was acquired

Also updates the status constraint to include 'queued_for_slot' and 'submitting'.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "add7f8b9c0e1"
down_revision: Union[str, None] = "1f2e3d4c5b6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Queue slot lifecycle columns
    op.add_column("tasks", sa.Column("queue_position", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True))

    # Slot owner metadata columns
    op.add_column("tasks", sa.Column("slot_owner_token", sa.String(64), nullable=True))
    op.add_column("tasks", sa.Column("slot_config_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tasks", sa.Column("slot_acquired_at", sa.DateTime(timezone=True), nullable=True))

    # Update status constraint to include new queue-based statuses
    op.drop_constraint("ck_tasks_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_status",
        "tasks",
        "status IN ('queued', 'queued_for_slot', 'running', 'submitting', 'succeeded', 'failed', 'canceled', 'waiting_external')",
    )

    # Index for efficient queue position queries
    op.create_index(
        "idx_tasks_queued_for_slot",
        "tasks",
        ["status", "slot_config_id", "queue_position"],
        postgresql_where=sa.text("status = 'queued_for_slot'"),
    )


def downgrade() -> None:
    op.drop_index("idx_tasks_queued_for_slot", table_name="tasks")

    op.drop_constraint("ck_tasks_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_status",
        "tasks",
        "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'waiting_external')",
    )

    op.drop_column("tasks", "slot_acquired_at")
    op.drop_column("tasks", "slot_config_id")
    op.drop_column("tasks", "slot_owner_token")
    op.drop_column("tasks", "queued_at")
    op.drop_column("tasks", "queue_position")
