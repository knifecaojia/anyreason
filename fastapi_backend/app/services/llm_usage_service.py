from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LLMUsageDaily, LLMUsageEvent
from app.repositories.llm_repository import llm_repository


def _safe_int(value: Any) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except Exception:
        return 0


def _safe_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _safe_uuid(value: Any) -> UUID | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return UUID(value)
    except Exception:
        return None


class LLMUsageService:
    async def list_my_usage_daily(self, *, db: AsyncSession, user_id: UUID, limit: int = 90):
        return await llm_repository.list_user_usage_daily(db=db, user_id=user_id, limit=limit)

    async def list_my_usage_events(self, *, db: AsyncSession, user_id: UUID, limit: int = 200):
        return await llm_repository.list_user_usage_events(db=db, user_id=user_id, limit=limit)

    async def record_usage(self, *, db: AsyncSession, payload: dict[str, Any]) -> None:
        metadata = payload.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}

        user_id = _safe_uuid(metadata.get("user_id")) or _safe_uuid(payload.get("user_id"))

        usage = payload.get("usage")
        if not isinstance(usage, dict):
            usage = {}

        prompt_tokens = _safe_int(usage.get("prompt_tokens"))
        completion_tokens = _safe_int(usage.get("completion_tokens"))
        total_tokens = _safe_int(usage.get("total_tokens")) or (prompt_tokens + completion_tokens)

        model = payload.get("model")
        if not isinstance(model, str):
            model = None

        endpoint = payload.get("endpoint")
        if not isinstance(endpoint, str):
            endpoint = payload.get("call_type") if isinstance(payload.get("call_type"), str) else None

        request_id = payload.get("request_id")
        if not isinstance(request_id, str):
            request_id = payload.get("litellm_call_id") if isinstance(payload.get("litellm_call_id"), str) else None

        latency_ms = payload.get("latency_ms")
        if latency_ms is None:
            latency_ms = payload.get("response_ms")
        latency_ms_int = _safe_int(latency_ms) if latency_ms is not None else None

        cost = _safe_decimal(payload.get("cost")) or _safe_decimal(payload.get("response_cost"))

        event = LLMUsageEvent(
            user_id=user_id,
            request_id=request_id,
            model=model,
            endpoint=endpoint,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms_int,
            cost=cost,
            raw_payload=payload,
        )
        db.add(event)

        if user_id is None or model is None:
            await db.flush()
            return

        now = datetime.now(timezone.utc)
        today = now.date()

        stmt = (
            insert(LLMUsageDaily)
            .values(
                user_id=user_id,
                date=today,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                request_count=1,
                cost=cost or Decimal("0"),
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "date", "model"],
                set_={
                    "prompt_tokens": LLMUsageDaily.prompt_tokens + prompt_tokens,
                    "completion_tokens": LLMUsageDaily.completion_tokens + completion_tokens,
                    "total_tokens": LLMUsageDaily.total_tokens + total_tokens,
                    "request_count": LLMUsageDaily.request_count + 1,
                    "cost": LLMUsageDaily.cost + (cost or Decimal("0")),
                    "updated_at": now,
                },
            )
        )
        await db.execute(stmt)
        await db.flush()


llm_usage_service = LLMUsageService()
