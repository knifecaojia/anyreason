from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models import CreditTransaction, UserCreditAccount


class CreditService:
    async def ensure_account(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        initial_balance: int,
        reason: str = "init",
        actor_user_id: UUID | None = None,
        meta: dict[str, Any] | None = None,
    ) -> UserCreditAccount:
        if initial_balance < 0:
            raise AppError(msg="Invalid initial balance", code=400, status_code=400)

        res = await db.execute(select(UserCreditAccount).where(UserCreditAccount.user_id == user_id))
        existing = res.scalars().first()
        if existing:
            return existing

        account = UserCreditAccount(user_id=user_id, balance=initial_balance)
        db.add(account)
        db.add(
            CreditTransaction(
                user_id=user_id,
                delta=initial_balance,
                balance_after=initial_balance,
                reason=reason,
                actor_user_id=actor_user_id,
                meta=meta or {},
            )
        )
        await db.flush()
        return account

    async def get_balance(self, *, db: AsyncSession, user_id: UUID) -> int:
        res = await db.execute(select(UserCreditAccount.balance).where(UserCreditAccount.user_id == user_id))
        bal = res.scalar_one_or_none()
        if bal is None:
            raise AppError(msg="Credit account missing", code=404, status_code=404)
        return int(bal)

    async def adjust_balance(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        delta: int,
        reason: str,
        actor_user_id: UUID | None = None,
        meta: dict[str, Any] | None = None,
        allow_negative: bool = False,
    ) -> UserCreditAccount:
        if delta == 0:
            raise AppError(msg="Delta must be non-zero", code=400, status_code=400)

        row_res = await db.execute(
            select(UserCreditAccount)
            .where(UserCreditAccount.user_id == user_id)
            .with_for_update()
        )
        account = row_res.scalars().first()
        if not account:
            raise AppError(msg="Credit account missing", code=404, status_code=404)

        next_balance = int(account.balance or 0) + int(delta)
        if not allow_negative and next_balance < 0:
            raise AppError(msg="Insufficient credits", code=402, status_code=402)

        account.balance = next_balance
        db.add(
            CreditTransaction(
                user_id=user_id,
                delta=delta,
                balance_after=next_balance,
                reason=reason,
                actor_user_id=actor_user_id,
                meta=meta or {},
            )
        )
        await db.flush()
        return account

    async def set_balance(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        new_balance: int,
        reason: str,
        actor_user_id: UUID | None = None,
        meta: dict[str, Any] | None = None,
    ) -> UserCreditAccount:
        if new_balance < 0:
            raise AppError(msg="Balance must be non-negative", code=400, status_code=400)

        row_res = await db.execute(
            select(UserCreditAccount)
            .where(UserCreditAccount.user_id == user_id)
            .with_for_update()
        )
        account = row_res.scalars().first()
        if not account:
            raise AppError(msg="Credit account missing", code=404, status_code=404)

        delta = int(new_balance) - int(account.balance or 0)
        if delta == 0:
            return account

        account.balance = int(new_balance)
        db.add(
            CreditTransaction(
                user_id=user_id,
                delta=delta,
                balance_after=int(new_balance),
                reason=reason,
                actor_user_id=actor_user_id,
                meta=meta or {},
            )
        )
        await db.flush()
        return account


credit_service = CreditService()

