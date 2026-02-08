from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LLMUsageDaily, LLMUsageEvent, LLMVirtualKey


class LLMRepository:
    async def list_user_virtual_keys(self, *, db: AsyncSession, user_id: UUID) -> list[LLMVirtualKey]:
        rows = (
            await db.execute(
                select(LLMVirtualKey)
                .where(LLMVirtualKey.user_id == user_id)
                .order_by(LLMVirtualKey.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def create_virtual_key(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        purpose: str,
        litellm_key_id: str | None,
        key_prefix: str,
        key_hash: str,
        encrypted_token: bytes | None,
        expires_at: datetime | None,
    ) -> LLMVirtualKey:
        row = LLMVirtualKey(
            user_id=user_id,
            purpose=purpose,
            litellm_key_id=litellm_key_id,
            key_prefix=key_prefix,
            key_hash=key_hash,
            encrypted_token=encrypted_token,
            expires_at=expires_at,
        )
        db.add(row)
        await db.flush()
        return row

    async def get_user_virtual_key(self, *, db: AsyncSession, user_id: UUID, key_id: UUID) -> LLMVirtualKey | None:
        row = (
            await db.execute(
                select(LLMVirtualKey).where(LLMVirtualKey.id == key_id, LLMVirtualKey.user_id == user_id)
            )
        ).scalars().first()
        return row

    async def revoke_virtual_key(self, *, db: AsyncSession, user_id: UUID, key_id: UUID) -> bool:
        now = datetime.now(timezone.utc)
        res = await db.execute(
            update(LLMVirtualKey)
            .where(LLMVirtualKey.id == key_id, LLMVirtualKey.user_id == user_id)
            .values(status="revoked", revoked_at=now)
        )
        return (res.rowcount or 0) > 0

    async def revoke_user_keys_by_purpose(self, *, db: AsyncSession, user_id: UUID, purpose: str) -> int:
        now = datetime.now(timezone.utc)
        res = await db.execute(
            update(LLMVirtualKey)
            .where(
                LLMVirtualKey.user_id == user_id,
                LLMVirtualKey.purpose == purpose,
                LLMVirtualKey.status == "active",
            )
            .values(status="revoked", revoked_at=now)
        )
        return int(res.rowcount or 0)

    async def list_user_usage_daily(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 90,
    ) -> list[LLMUsageDaily]:
        rows = (
            await db.execute(
                select(LLMUsageDaily)
                .where(LLMUsageDaily.user_id == user_id)
                .order_by(LLMUsageDaily.date.desc(), LLMUsageDaily.model.asc())
                .limit(limit)
            )
        ).scalars().all()
        return list(rows)

    async def list_user_usage_events(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 200,
    ) -> list[LLMUsageEvent]:
        rows = (
            await db.execute(
                select(LLMUsageEvent)
                .where(LLMUsageEvent.user_id == user_id)
                .order_by(LLMUsageEvent.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        return list(rows)


llm_repository = LLMRepository()
