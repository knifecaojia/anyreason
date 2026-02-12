from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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

    model_config = {"from_attributes": True}


class AdminCreditAdjustRequest(BaseModel):
    delta: int
    reason: str = "admin.adjust"
    meta: dict[str, Any] | None = None


class AdminCreditSetRequest(BaseModel):
    balance: int
    reason: str = "admin.set"
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

