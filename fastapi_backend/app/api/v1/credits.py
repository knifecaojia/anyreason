from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_log
from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import CreditTransaction, UserCreditAccount
from app.rbac import require_permissions
from app.schemas_credits import (
    AdminCreditAdjustRequest,
    AdminCreditSetRequest,
    CreditAccountRead,
    CreditMyRead,
    CreditRedeemRequest,
    CreditTopupIntentRequest,
    CreditTransactionRead,
)
from app.schemas_response import ResponseBase
from app.services.credit_service import credit_service
from app.users import current_active_user


router = APIRouter(prefix="/credits")


@router.get("/my", response_model=ResponseBase[CreditMyRead])
async def my_credits(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[CreditMyRead]:
    bal = await credit_service.get_balance(db=db, user_id=user.id)
    return ResponseBase(code=200, msg="OK", data=CreditMyRead(balance=bal))


@router.get("/my/transactions", response_model=ResponseBase[list[CreditTransactionRead]])
async def my_credit_transactions(
    limit: int = 50,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[list[CreditTransactionRead]]:
    q = (
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(min(max(int(limit), 1), 200))
    )
    rows = (await db.execute(q)).scalars().all()
    return ResponseBase(code=200, msg="OK", data=[CreditTransactionRead.model_validate(r) for r in rows])


@router.get(
    "/admin/users/{user_id}",
    response_model=ResponseBase[dict],
    dependencies=[Depends(require_permissions(["system.credits"]))],
)
async def admin_get_user_credits(
    user_id: UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_async_session),
) -> ResponseBase[dict]:
    acc = (await db.execute(select(UserCreditAccount).where(UserCreditAccount.user_id == user_id))).scalars().first()
    if not acc:
        raise AppError(msg="Credit account missing", code=404, status_code=404)
    tx_rows = (
        await db.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.created_at.desc())
            .limit(min(max(int(limit), 1), 200))
        )
    ).scalars().all()
    return ResponseBase(
        code=200,
        msg="OK",
        data={
            "account": CreditAccountRead.model_validate(acc),
            "transactions": [CreditTransactionRead.model_validate(t) for t in tx_rows],
        },
    )


@router.post(
    "/admin/users/{user_id}/adjust",
    response_model=ResponseBase[CreditAccountRead],
    dependencies=[Depends(require_permissions(["system.credits"]))],
)
async def admin_adjust_user_credits(
    request: Request,
    user_id: UUID,
    body: AdminCreditAdjustRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.credits"])),
) -> ResponseBase[CreditAccountRead]:
    account = await credit_service.adjust_balance(
        db=db,
        user_id=user_id,
        delta=body.delta,
        reason=body.reason or "admin.adjust",
        actor_user_id=actor.id,
        meta=body.meta,
        allow_negative=False,
    )
    await db.commit()
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="credits.adjust",
        resource_type="user",
        resource_id=user_id,
        meta={"delta": body.delta, "reason": body.reason, "meta": body.meta or {}},
    )
    return ResponseBase(code=200, msg="OK", data=CreditAccountRead.model_validate(account))


@router.post(
    "/admin/users/{user_id}/set",
    response_model=ResponseBase[CreditAccountRead],
    dependencies=[Depends(require_permissions(["system.credits"]))],
)
async def admin_set_user_credits(
    request: Request,
    user_id: UUID,
    body: AdminCreditSetRequest,
    db: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.credits"])),
) -> ResponseBase[CreditAccountRead]:
    account = await credit_service.set_balance(
        db=db,
        user_id=user_id,
        new_balance=body.balance,
        reason=body.reason or "admin.set",
        actor_user_id=actor.id,
        meta=body.meta,
    )
    await db.commit()
    await write_audit_log(
        session=db,
        request=request,
        actor_user_id=actor.id,
        action="credits.set",
        resource_type="user",
        resource_id=user_id,
        meta={"balance": body.balance, "reason": body.reason, "meta": body.meta or {}},
    )
    return ResponseBase(code=200, msg="OK", data=CreditAccountRead.model_validate(account))


@router.post("/topup/intent", response_model=ResponseBase[dict])
async def create_topup_intent(
    body: CreditTopupIntentRequest,
    user: User = Depends(current_active_user),
) -> ResponseBase[dict]:
    raise AppError(msg="Not implemented", code=501, status_code=501, data={"user_id": str(user.id), "amount": body.amount})


@router.post("/redeem", response_model=ResponseBase[dict])
async def redeem_credits(
    body: CreditRedeemRequest,
    user: User = Depends(current_active_user),
) -> ResponseBase[dict]:
    raise AppError(msg="Not implemented", code=501, status_code=501, data={"user_id": str(user.id), "code": body.code})

