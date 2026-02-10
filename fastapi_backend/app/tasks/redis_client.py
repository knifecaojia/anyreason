from __future__ import annotations

from functools import lru_cache

from redis.asyncio import Redis
from redis.asyncio import from_url

from app.config import settings


@lru_cache(maxsize=1)
def get_redis() -> Redis:
    return from_url(settings.REDIS_URL, decode_responses=True)
