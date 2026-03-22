from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreditAccountRead(BaseModel):
    user_id: UUID
    balance: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreditTransactionRead(BaseModel):
    id: UUID
    user_id: UUID
    delta: int
    balance_after: int
    reason: str
    actor_user_id: UUID | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    # Computed traceability fields for API responses
    trace_type: str | None = Field(default=None, description="Discriminator: 'ai', 'agent', 'admin', or 'init'")
    operation_display: str | None = Field(default=None, description="Human-readable operation description")
    is_refund: bool = Field(default=False, description="Whether this is a refund transaction")
    linked_event_id: UUID | None = Field(default=None, description="Linked AIUsageEvent ID")
    category: str | None = Field(default=None, description="AI operation category")
    model_display: str | None = Field(default=None, description="Model name for display")

    @model_validator(mode='before')
    @classmethod
    def extract_trace_fields(cls, data: Any) -> Any:
        """Extract traceability fields from meta for API responses."""
        # Extract meta from various input types
        if hasattr(data, '__dict__'):
            # SQLAlchemy model instance
            meta = dict(data.meta) if data.meta else {}
            # Convert SQLAlchemy model to dict
            data = {
                'id': data.id,
                'user_id': data.user_id,
                'delta': data.delta,
                'balance_after': data.balance_after,
                'reason': data.reason,
                'actor_user_id': data.actor_user_id,
                'meta': meta,
                'created_at': data.created_at,
            }
        elif isinstance(data, dict):
            meta = data.get('meta', {})
        else:
            meta = {}

        if isinstance(data, dict):
            meta = data.get('meta', {})

            # Extract trace_type
            trace_type = meta.get('trace_type')

            # Extract is_refund
            is_refund = meta.get('refunded', False)

            # Extract linked_event_id
            linked_event_id = meta.get('ai_usage_event_id')
            if linked_event_id:
                try:
                    linked_event_id = UUID(linked_event_id)
                except (ValueError, TypeError):
                    linked_event_id = None

            # Extract category
            category = meta.get('category')

            # Build operation_display
            operation_display = None
            if trace_type == 'ai':
                cat = meta.get('category', '')
                model = meta.get('model', '')
                if cat == 'text':
                    operation_display = f"文本生成: {model}" if model else "文本生成"
                elif cat == 'image':
                    operation_display = f"图像生成: {model}" if model else "图像生成"
                elif cat == 'video':
                    operation_display = f"视频生成: {model}" if model else "视频生成"
                else:
                    operation_display = f"AI操作: {cat}"
            elif trace_type == 'agent':
                agent_name = meta.get('agent_name', meta.get('agent_id', ''))
                operation_display = f"智能体: {agent_name}"
            elif trace_type == 'admin':
                operation_display = "管理员调整"
            elif trace_type == 'init':
                operation_display = "账户初始化"

            # Build model_display
            model_display = meta.get('model') or meta.get('manufacturer')

            # Add computed fields
            data['trace_type'] = trace_type
            data['is_refund'] = is_refund
            data['linked_event_id'] = linked_event_id
            data['operation_display'] = operation_display
            data['category'] = category
            data['model_display'] = model_display

        return data

    model_config = {"from_attributes": True}


class CreditTransactionAdminRead(CreditTransactionRead):
    """Extended schema for admin views with full meta access."""
    raw_payload: dict[str, Any] | None = Field(default=None, description="Raw AIUsageEvent payload for debugging")

    @model_validator(mode='after')
    def extract_admin_fields(self) -> 'CreditTransactionAdminRead':
        """Extract admin-specific fields from meta and linked events."""
        # For now, return as-is. In future, could join with AIUsageEvent for raw_payload
        return self


class AdminCreditAdjustRequest(BaseModel):
    delta: int
    reason: str = "admin.adjust"
    notes: str | None = None
    meta: dict[str, Any] | None = None


class AdminCreditSetRequest(BaseModel):
    balance: int
    reason: str = "admin.set"
    notes: str | None = None
    meta: dict[str, Any] | None = None


class CreditMyRead(BaseModel):
    balance: int


class CreditTopupIntentRequest(BaseModel):
    amount: int
    channel: str | None = None
    meta: dict[str, Any] | None = None


class CreditRedeemRequest(BaseModel):
    code: str
    meta: dict[str, Any] | None = None

