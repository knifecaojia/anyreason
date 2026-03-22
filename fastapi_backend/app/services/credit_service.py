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
        """Ensure a credit account exists for a user, creating if necessary.
        
        Args:
            db: Database session
            user_id: The user ID
            initial_balance: Starting balance (for new accounts)
            reason: Transaction reason (default: "init")
            actor_user_id: Admin user ID for admin-initiated operations
            meta: Additional metadata. For "init" reason, should include trace_type="init"
        
        Returns:
            UserCreditAccount: The user's credit account
        """
        if initial_balance < 0:
            raise AppError(msg="Invalid initial balance", code=400, status_code=400)

        res = await db.execute(select(UserCreditAccount).where(UserCreditAccount.user_id == user_id))
        existing = res.scalars().first()
        if existing:
            return existing

        # Ensure meta has trace_type for init transactions
        final_meta = meta or {}
        if "trace_type" not in final_meta and reason == "init":
            final_meta["trace_type"] = "init"

        account = UserCreditAccount(user_id=user_id, balance=initial_balance)
        db.add(account)
        db.add(
            CreditTransaction(
                user_id=user_id,
                delta=initial_balance,
                balance_after=initial_balance,
                reason=reason,
                actor_user_id=actor_user_id,
                meta=final_meta,
            )
        )
        await db.flush()
        return account

    async def get_balance(self, *, db: AsyncSession, user_id: UUID) -> int:
        """Get the current credit balance for a user."""
        res = await db.execute(select(UserCreditAccount.balance).where(UserCreditAccount.user_id == user_id))
        bal = res.scalar_one_or_none()
        if bal is None:
            raise AppError(msg="积分账户不存在", code=404, status_code=404)
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
    ) -> tuple[UserCreditAccount, CreditTransaction | None]:
        """Adjust a user's credit balance by delta.
        
        Args:
            db: Database session
            user_id: The user ID
            delta: Change amount (positive for credit, negative for debit)
            reason: Transaction reason (e.g., "ai.consume", "ai.refund", "agent.consume", "admin.adjust")
            actor_user_id: Admin user ID for admin-initiated operations
            meta: Additional metadata. Should include:
                - trace_type: "ai" | "agent" | "admin"
                - For ai operations: category, binding_key, ai_model_config_id, ai_usage_event_id
                - For refunds: refunded, original_transaction_id, original_delta
                - For admin: notes, previous_balance
            allow_negative: Whether to allow balance to go negative
        
        Returns:
            Tuple of (UserCreditAccount, CreditTransaction or None if no transaction created)
        """
        if delta == 0:
            raise AppError(msg="Delta must be non-zero", code=400, status_code=400)

        row_res = await db.execute(
            select(UserCreditAccount)
            .where(UserCreditAccount.user_id == user_id)
            .with_for_update()
        )
        account = row_res.scalars().first()
        if not account:
            raise AppError(msg="积分账户不存在", code=404, status_code=404)

        next_balance = int(account.balance or 0) + int(delta)
        if not allow_negative and next_balance < 0:
            raise AppError(msg="积分余额不足", code=402, status_code=402)

        account.balance = next_balance
        
        # Add trace_type discriminator based on reason if not provided
        final_meta = meta or {}
        if "trace_type" not in final_meta:
            if reason.startswith("ai."):
                final_meta["trace_type"] = "ai"
            elif reason.startswith("agent."):
                final_meta["trace_type"] = "agent"
            elif reason.startswith("admin."):
                final_meta["trace_type"] = "admin"

        transaction = CreditTransaction(
            user_id=user_id,
            delta=delta,
            balance_after=next_balance,
            reason=reason,
            actor_user_id=actor_user_id,
            meta=final_meta,
        )
        db.add(transaction)
        await db.flush()
        return account, transaction

    async def adjust_balance_simple(
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
        """Legacy method for backward compatibility. Prefer adjust_balance which returns transaction.
        
        DEPRECATED: Use adjust_balance() which returns the transaction for traceability.
        """
        account, _ = await self.adjust_balance(
            db=db,
            user_id=user_id,
            delta=delta,
            reason=reason,
            actor_user_id=actor_user_id,
            meta=meta,
            allow_negative=allow_negative,
        )
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
    ) -> tuple[UserCreditAccount, CreditTransaction | None]:
        """Set a user's credit balance to a specific value.
        
        Args:
            db: Database session
            user_id: The user ID
            new_balance: Target balance (non-negative)
            reason: Transaction reason (e.g., "admin.set")
            actor_user_id: Admin user ID
            meta: Additional metadata. For set operations, should include:
                - trace_type: "admin"
                - notes: admin-provided notes
                - previous_balance: balance before adjustment
        
        Returns:
            Tuple of (UserCreditAccount, CreditTransaction or None if no delta)
        """
        if new_balance < 0:
            raise AppError(msg="Balance must be non-negative", code=400, status_code=400)

        row_res = await db.execute(
            select(UserCreditAccount)
            .where(UserCreditAccount.user_id == user_id)
            .with_for_update()
        )
        account = row_res.scalars().first()
        if not account:
            raise AppError(msg="积分账户不存在", code=404, status_code=404)

        previous_balance = int(account.balance or 0)
        delta = int(new_balance) - previous_balance
        if delta == 0:
            return account, None

        # Ensure meta has trace_type for admin operations
        final_meta = meta or {}
        if "trace_type" not in final_meta:
            final_meta["trace_type"] = "admin"
        if "previous_balance" not in final_meta:
            final_meta["previous_balance"] = previous_balance

        account.balance = int(new_balance)
        transaction = CreditTransaction(
            user_id=user_id,
            delta=delta,
            balance_after=int(new_balance),
            reason=reason,
            actor_user_id=actor_user_id,
            meta=final_meta,
        )
        db.add(transaction)
        await db.flush()
        return account, transaction

    async def set_balance_simple(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        new_balance: int,
        reason: str,
        actor_user_id: UUID | None = None,
        meta: dict[str, Any] | None = None,
    ) -> UserCreditAccount:
        """Legacy method for backward compatibility. Prefer set_balance which returns transaction.
        
        DEPRECATED: Use set_balance() which returns the transaction for traceability.
        """
        account, _ = await self.set_balance(
            db=db,
            user_id=user_id,
            new_balance=new_balance,
            reason=reason,
            actor_user_id=actor_user_id,
            meta=meta,
        )
        return account

    async def get_transaction(self, *, db: AsyncSession, transaction_id: UUID) -> CreditTransaction | None:
        """Get a credit transaction by ID."""
        return await db.get(CreditTransaction, transaction_id)


credit_service = CreditService()

