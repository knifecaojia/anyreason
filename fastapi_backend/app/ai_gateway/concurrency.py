from __future__ import annotations
import hashlib
import logging
from typing import Any
from uuid import UUID
from app.tasks.redis_client import get_redis

logger = logging.getLogger(__name__)

class AIKeyConcurrencyManager:
    def _get_key_hash(self, api_key: str) -> str:
        return hashlib.sha256(api_key.encode()).hexdigest()[:16]

    def _get_redis_key(self, config_id: UUID, key_hash: str) -> str:
        return f"ai_concurrency:{config_id}:{key_hash}"

    async def acquire_key(self, config_id: UUID, keys_info: list[dict[str, Any]] | None, default_key: str | None) -> dict[str, Any] | None:
        """
        Choose an available API key based on concurrency limits.
        Returns the chosen key info (including 'api_key') or None if all are full.
        """
        redis = get_redis()
        
        candidates = []
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    candidates.append({
                        "api_key": k["api_key"],
                        "limit": k.get("concurrency_limit", 5),
                        "id": str(k.get("id", "none"))
                    })
        
        # If no multi-keys enabled, use the default single key
        if not candidates and default_key:
            candidates.append({
                "api_key": default_key,
                "limit": 5, # Default limit for single key
                "id": "default"
            })
            
        if not candidates:
            return None

        for cand in candidates:
            key_hash = self._get_key_hash(cand["api_key"])
            redis_key = self._get_redis_key(config_id, key_hash)
            
            # Atomic increment
            current = await redis.incr(redis_key)
            if current > cand["limit"]:
                # Full, rollback
                await redis.decr(redis_key)
                continue
                
            # Success: set TTL just in case to prevent leaks (e.g., 2 hours)
            await redis.expire(redis_key, 7200)
            
            # Found an available key
            logger.info(f"Acquired key id={cand['id']} for config={config_id} (concurrency={current})")
            return cand
            
        return None

    async def release_key(self, config_id: UUID, api_key: str) -> None:
        if not api_key:
            return
        redis = get_redis()
        key_hash = self._get_key_hash(api_key)
        redis_key = self._get_redis_key(config_id, key_hash)
        
        # Decrement
        current = await redis.decr(redis_key)
        if current < 0:
            await redis.set(redis_key, 0)
        
        logger.info(f"Released key for config={config_id} (concurrency={max(0, current)})")

concurrency_manager = AIKeyConcurrencyManager()
