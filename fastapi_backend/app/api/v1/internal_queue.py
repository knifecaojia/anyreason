"""
Internal queue observability API endpoints for Task 9.

These endpoints provide operator/admin visibility into:
- Queue depth per model config
- Slot utilization (active/total/available)
- Stale slot detection for diagnostics
- Combined queue health summary

These endpoints are admin-only and redact secrets (key IDs/hashes only, no plaintext keys).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway.concurrency import AIKeyConcurrencyManager
from app.database import User, get_async_session
from app.models import AIModelConfig, Task
from app.schemas import (
    QueueDepthInfo,
    QueueHealthConfigSummary,
    QueueHealthResponse,
    SlotUtilizationInfo,
    StaleOwnerInfo,
)
from app.schemas_response import ResponseBase
from app.users import current_active_superuser


router = APIRouter(prefix="/internal/queue", tags=["queue"])


def _require_superuser(user: User = Depends(current_active_superuser)) -> User:
    """Dependency that requires superuser privileges."""
    return user


async def _get_all_model_configs(db: AsyncSession) -> list[AIModelConfig]:
    """Get all model configs for queue inspection."""
    result = await db.execute(select(AIModelConfig))
    return list(result.scalars().all())


async def _get_queue_owners_for_config(
    config_id: UUID,
) -> list[tuple[str, dict[str, Any]]]:
    """Get all owner entries for a config from Redis."""
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()
    # Convert to string for Redis key operations
    config_id_str = str(config_id)
    queue_key = manager._get_queue_key(config_id)

    queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
    owners: list[tuple[str, dict[str, Any]]] = []

    for owner_token in queue:
        owner_key = manager._get_owner_key(config_id, owner_token)
        metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
        if metadata:
            # Redact: only include key_id, not api_key
            safe_metadata: dict[str, Any] = {
                "owner_token": owner_token,
                "key_id": metadata.get("key_id"),
                "enqueued_at": metadata.get("enqueued_at"),
                "acquired_at": metadata.get("acquired_at"),
                "task_id": metadata.get("task_id"),
                "is_queue_entry": True,
            }
            owners.append((owner_token, safe_metadata))

    return owners


async def _get_active_owners_for_config(
    config_id: UUID,
) -> list[tuple[str, dict[str, Any]]]:
    """Get all active slot owners for a config from Redis."""
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()
    current_time = time.time()

    owner_pattern = f"{manager.OWNER_KEY_PREFIX}:{config_id}:*"
    owners: list[tuple[str, dict[str, Any]]] = []

    try:
        owner_keys: list[str] = []
        async for key in redis.scan_iter(match=owner_pattern):  # type: ignore[misc]
            owner_keys.append(key)
    except AttributeError:
        owner_keys = []

    for owner_key in owner_keys:
        metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
        if metadata and metadata.get("acquired_at"):
            # Redact: only include key_id, not api_key
            acquired_at = float(metadata.get("acquired_at", 0))
            safe_metadata: dict[str, Any] = {
                "owner_token": owner_key.split(":")[-1],
                "key_id": metadata.get("key_id"),
                "enqueued_at": metadata.get("enqueued_at"),
                "acquired_at": metadata.get("acquired_at"),
                "task_id": metadata.get("task_id"),
                "age_seconds": current_time - acquired_at,
                "is_queue_entry": False,
            }
            owners.append((owner_key, safe_metadata))

    return owners


def _parse_timestamp(ts: str | None) -> datetime | None:
    """Parse Unix timestamp string to datetime."""
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    except (ValueError, TypeError):
        return None


def _safe_key_id(key_info: dict[str, Any] | None) -> str | None:
    """Extract safe key identifier from key info (never expose plaintext)."""
    if key_info is None:
        return None
    return key_info.get("id") or key_info.get("key_id") or key_info.get("key_hash")


# ---------------------------------------------------------------------------
# Endpoint: GET /api/v1/internal/queue/depth
# ---------------------------------------------------------------------------

@router.get("/depth", response_model=ResponseBase[dict[str, QueueDepthInfo]])
async def get_queue_depth(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(_require_superuser),
) -> ResponseBase[dict[str, QueueDepthInfo]]:
    """
    Get queue depth per model config.

    Returns queue depth information for each model config that has
    video/media generation capabilities.

    Response structure:
    {
        "config_id_1": {"config_id": "...", "queue_depth": N, ...},
        ...
    }
    """
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()

    configs = await _get_all_model_configs(db)
    result: dict[str, QueueDepthInfo] = {}

    for config in configs:
        config_id = config.id

        # Get queue depth
        queue_key = manager._get_queue_key(config_id)
        depth: int = await redis.llen(queue_key)  # type: ignore[misc]

        # Get timestamp range for queued tasks
        oldest_at: datetime | None = None
        newest_at: datetime | None = None

        if depth > 0:
            queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
            timestamps: list[float] = []

            for owner_token in queue:
                owner_key = manager._get_owner_key(config_id, owner_token)
                metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
                if metadata and metadata.get("enqueued_at"):
                    try:
                        ts = float(metadata["enqueued_at"])
                        timestamps.append(ts)
                    except (ValueError, TypeError):
                        pass

            if timestamps:
                oldest_at = datetime.fromtimestamp(min(timestamps), tz=timezone.utc)
                newest_at = datetime.fromtimestamp(max(timestamps), tz=timezone.utc)

        result[str(config_id)] = QueueDepthInfo(
            config_id=config_id,
            queue_depth=depth,
            oldest_queued_at=oldest_at,
            newest_queued_at=newest_at,
        )

    return ResponseBase(code=200, msg="OK", data=result)


# ---------------------------------------------------------------------------
# Endpoint: GET /api/v1/internal/queue/utilization
# ---------------------------------------------------------------------------

@router.get("/utilization", response_model=ResponseBase[dict[str, SlotUtilizationInfo]])
async def get_slot_utilization(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(_require_superuser),
) -> ResponseBase[dict[str, SlotUtilizationInfo]]:
    """
    Get slot utilization per model config.

    Returns active, total, and available slot counts for each model config.

    Response structure:
    {
        "config_id_1": {"config_id": "...", "active": N, "total": M, "available": K},
        ...
    }

    Note: Key information is redacted - only safe identifiers are exposed.
    """
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()

    configs = await _get_all_model_configs(db)
    result: dict[str, SlotUtilizationInfo] = {}

    for config in configs:
        config_id = config.id

        # Get keys_info safely (may be encrypted or None)
        keys_info = getattr(config, "api_keys_info", None) or []
        default_key = getattr(config, "plaintext_api_key", None)

        # Build safe key info (no plaintext keys)
        safe_keys_info: list[dict[str, Any]] | None = None
        if keys_info:
            safe_keys_info = []
            for k in keys_info:
                safe_keys_info.append({
                    "id": k.get("id") or k.get("key_id"),
                    "enabled": k.get("enabled", True),
                    "concurrency_limit": k.get("concurrency_limit", 5),
                    # Explicitly exclude: api_key, key (plaintext)
                })

        # Calculate utilization
        total = manager._get_total_capacity(safe_keys_info, None)
        active = await manager._get_current_usage(config_id, safe_keys_info, None)

        result[str(config_id)] = SlotUtilizationInfo(
            config_id=config_id,
            active=active,
            total=total,
            available=max(0, total - active),
        )

    return ResponseBase(code=200, msg="OK", data=result)


# ---------------------------------------------------------------------------
# Endpoint: GET /api/v1/internal/queue/stale
# ---------------------------------------------------------------------------

@router.get("/stale", response_model=ResponseBase[dict[str, Any]])
async def get_stale_slots(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(_require_superuser),
) -> ResponseBase[dict[str, Any]]:
    """
    Get stale slot candidates for diagnostics.

    Returns information about:
    - Stale queued entries (in queue too long)
    - Stale active owners (holding slots too long)

    Age thresholds:
    - Queue: 1 hour (3600 seconds) since enqueued_at
    - Active: 2 hours (7200 seconds) since acquired_at

    Response structure:
    {
        "stale_queue": [...],
        "stale_active": [...],
        "total_stale": N
    }
    """
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()
    current_time = time.time()

    configs = await _get_all_model_configs(db)
    result: dict[str, Any] = {
        "stale_queue": [],
        "stale_active": [],
        "total_stale": 0,
    }

    for config in configs:
        config_id = config.id

        # Check stale queued entries
        queue_owners = await _get_queue_owners_for_config(config_id)
        for owner_token, metadata in queue_owners:
            enqueued_at = metadata.get("enqueued_at")
            if enqueued_at:
                try:
                    age = current_time - float(enqueued_at)
                    if age >= 3600:  # 1 hour
                        stale_info = StaleOwnerInfo(
                            owner_token=owner_token,
                            key_id=metadata.get("key_id"),
                            enqueued_at=_parse_timestamp(enqueued_at),
                            acquired_at=_parse_timestamp(metadata.get("acquired_at")),
                            age_seconds=age,
                            task_id=metadata.get("task_id"),
                            is_queue_entry=True,
                        )
                        result["stale_queue"].append(stale_info.model_dump())
                except (ValueError, TypeError):
                    pass

        # Check stale active owners
        active_owners = await _get_active_owners_for_config(config_id)
        for owner_token, metadata in active_owners:
            age = metadata.get("age_seconds")
            if age is not None and age >= 7200:  # 2 hours
                stale_info = StaleOwnerInfo(
                    owner_token=owner_token,
                    key_id=metadata.get("key_id"),
                    enqueued_at=_parse_timestamp(metadata.get("enqueued_at")),
                    acquired_at=_parse_timestamp(metadata.get("acquired_at")),
                    age_seconds=age,
                    task_id=metadata.get("task_id"),
                    is_queue_entry=False,
                )
                result["stale_active"].append(stale_info.model_dump())

    result["total_stale"] = len(result["stale_queue"]) + len(result["stale_active"])

    return ResponseBase(code=200, msg="OK", data=result)


# ---------------------------------------------------------------------------
# Endpoint: GET /api/v1/internal/queue/health
# ---------------------------------------------------------------------------

@router.get("/health", response_model=ResponseBase[QueueHealthResponse])
async def get_queue_health(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(_require_superuser),
) -> ResponseBase[QueueHealthResponse]:
    """
    Get combined queue health summary.

    This endpoint provides a comprehensive view of queue health across
    all model configs, including utilization, depth, and stale counts.

    Response structure:
    {
        "data": {
            "summary": {...},  # Overall summary
            "configs": {
                "config_id_1": {...},
                ...
            },
            "stale_owners": [...]
        }
    }
    """
    from app.tasks.redis_client import get_redis

    redis = get_redis()
    manager = AIKeyConcurrencyManager()
    current_time = time.time()

    configs = await _get_all_model_configs(db)
    config_summaries: dict[str, QueueHealthConfigSummary] = {}
    all_stale: list[StaleOwnerInfo] = []

    total_queue_depth = 0
    total_active = 0
    total_capacity = 0
    total_stale_queue = 0
    total_stale_active = 0

    for config in configs:
        config_id = config.id

        # Get keys_info safely
        keys_info = getattr(config, "api_keys_info", None) or []
        safe_keys_info: list[dict[str, Any]] | None = None
        if keys_info:
            safe_keys_info = []
            for k in keys_info:
                safe_keys_info.append({
                    "id": k.get("id") or k.get("key_id"),
                    "enabled": k.get("enabled", True),
                    "concurrency_limit": k.get("concurrency_limit", 5),
                })

        # Get queue depth
        queue_key = manager._get_queue_key(config_id)
        queue_depth: int = await redis.llen(queue_key)  # type: ignore[misc]

        # Get utilization
        total = manager._get_total_capacity(safe_keys_info, None)
        active = await manager._get_current_usage(config_id, safe_keys_info, None)

        # Count stale entries
        stale_queue = 0
        stale_active = 0

        # Check stale queue
        queue_owners = await _get_queue_owners_for_config(config_id)
        for owner_token, metadata in queue_owners:
            enqueued_at = metadata.get("enqueued_at")
            if enqueued_at:
                try:
                    age = current_time - float(enqueued_at)
                    if age >= 3600:
                        stale_queue += 1
                        all_stale.append(StaleOwnerInfo(
                            owner_token=owner_token,
                            key_id=metadata.get("key_id"),
                            enqueued_at=_parse_timestamp(enqueued_at),
                            age_seconds=age,
                            task_id=metadata.get("task_id"),
                            is_queue_entry=True,
                        ))
                except (ValueError, TypeError):
                    pass

        # Check stale active
        active_owners = await _get_active_owners_for_config(config_id)
        for owner_token, metadata in active_owners:
            age = metadata.get("age_seconds")
            if age is not None and age >= 7200:
                stale_active += 1
                all_stale.append(StaleOwnerInfo(
                    owner_token=owner_token,
                    key_id=metadata.get("key_id"),
                    enqueued_at=_parse_timestamp(metadata.get("enqueued_at")),
                    acquired_at=_parse_timestamp(metadata.get("acquired_at")),
                    age_seconds=age,
                    task_id=metadata.get("task_id"),
                    is_queue_entry=False,
                ))

        config_summary = QueueHealthConfigSummary(
            config_id=config_id,
            queue_depth=queue_depth,
            active=active,
            total=total,
            available=max(0, total - active),
            stale_queue_count=stale_queue,
            stale_active_count=stale_active,
        )
        config_summaries[str(config_id)] = config_summary

        # Accumulate totals
        total_queue_depth += queue_depth
        total_active += active
        total_capacity += total
        total_stale_queue += stale_queue
        total_stale_active += stale_active

    # Build overall summary
    overall_summary = QueueHealthConfigSummary(
        config_id=UUID("00000000-0000-0000-0000-000000000000"),  # Placeholder
        queue_depth=total_queue_depth,
        active=total_active,
        total=total_capacity,
        available=max(0, total_capacity - total_active),
        stale_queue_count=total_stale_queue,
        stale_active_count=total_stale_active,
    )

    return ResponseBase(code=200, msg="OK", data=QueueHealthResponse(
        summary=overall_summary,
        configs=config_summaries,
        stale_owners=all_stale,
    ))
