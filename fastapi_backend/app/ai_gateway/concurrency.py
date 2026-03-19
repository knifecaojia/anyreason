from __future__ import annotations
import hashlib
import logging
import time
import uuid
from typing import Any
from uuid import UUID
from app.tasks.redis_client import get_redis

logger = logging.getLogger(__name__)


class AIKeyConcurrencyManager:
    # TTL for owner metadata (in seconds) - used for stale detection
    OWNER_METADATA_TTL = 7200  # 2 hours
    QUEUE_KEY_PREFIX = "ai_queue"
    OWNER_KEY_PREFIX = "ai_owner"
    CONCURRENCY_KEY_PREFIX = "ai_concurrency"

    def _get_key_hash(self, api_key: str) -> str:
        return hashlib.sha256(api_key.encode()).hexdigest()[:16]

    def _get_redis_key(self, config_id: UUID, key_hash: str) -> str:
        return f"{self.CONCURRENCY_KEY_PREFIX}:{config_id}:{key_hash}"

    def _get_queue_key(self, config_id: UUID) -> str:
        """Get Redis key for the queue list for a config."""
        return f"{self.QUEUE_KEY_PREFIX}:{config_id}"

    def _get_owner_key(self, config_id: UUID, owner_token: str) -> str:
        """Get Redis key for owner metadata."""
        return f"{self.OWNER_KEY_PREFIX}:{config_id}:{owner_token}"

    def _get_total_capacity(self, keys_info: list[dict[str, Any]] | None, default_key: str | None) -> int:
        """Calculate total capacity = sum of enabled key limits."""
        total = 0
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    total += k.get("concurrency_limit", 5)
        
        if total == 0 and default_key:
            total = 5
            
        return total

    async def _get_current_usage(self, config_id: UUID, keys_info: list[dict[str, Any]] | None, default_key: str | None) -> int:
        """Get current slot usage across all keys for a config."""
        redis = get_redis()
        total_used = 0
        
        candidates: list[str] = []
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    candidates.append(k["api_key"])
        
        if not candidates and default_key:
            candidates.append(default_key)
        
        for api_key in candidates:
            key_hash = self._get_key_hash(api_key)
            redis_key = self._get_redis_key(config_id, key_hash)
            val = await redis.get(redis_key)
            if val:
                total_used += int(val)
        
        return total_used

    def _generate_owner_token(self) -> str:
        """Generate a unique owner token."""
        return uuid.uuid4().hex

    async def _get_queue_position(self, config_id: UUID, owner_token: str) -> int | None:
        """Get queue position for an owner token. Returns 1-based position or None if not queued."""
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        
        queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
        if not queue:
            return None
        
        try:
            position = queue.index(owner_token)
            return position + 1
        except ValueError:
            return None

    async def enqueue_owner(self, config_id: UUID, owner_token: str, metadata: dict[str, Any] | None = None) -> int:
        """
        Add an owner to the FIFO queue.
        Returns the queue position (1-based).
        """
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        
        await redis.rpush(queue_key, owner_token)  # type: ignore[misc]
        
        owner_key = self._get_owner_key(config_id, owner_token)
        metadata = metadata or {}
        metadata["enqueued_at"] = str(time.time())
        
        await redis.hset(owner_key, mapping={  # type: ignore[misc]
            "owner_token": owner_token,
            "enqueued_at": metadata.get("enqueued_at", str(time.time())),
            "task_id": metadata.get("task_id", ""),
        })
        await redis.expire(owner_key, self.OWNER_METADATA_TTL)
        
        position: int = await redis.llen(queue_key)  # type: ignore[misc]
        return position

    async def dequeue_owner(self, config_id: UUID) -> str | None:
        """
        Remove and return the next owner from the queue (FIFO).
        Returns owner token or None if queue is empty.
        """
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        
        owner_token: str | None = await redis.lpop(queue_key)  # type: ignore[misc]
        
        if owner_token:
            owner_key = self._get_owner_key(config_id, owner_token)
            await redis.delete(owner_key)
        
        return owner_token

    async def remove_from_queue(self, config_id: UUID, owner_token: str) -> bool:
        """
        Remove a specific owner from the queue (for cancellation).
        Returns True if owner was found and removed.
        """
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        
        queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
        
        if owner_token not in queue:
            return False
        
        new_queue = [o for o in queue if o != owner_token]
        
        await redis.delete(queue_key)
        if new_queue:
            await redis.rpush(queue_key, *new_queue)  # type: ignore[misc]
        
        owner_key = self._get_owner_key(config_id, owner_token)
        await redis.delete(owner_key)
        
        return True

    async def get_queue_depth(self, config_id: UUID) -> int:
        """Get number of owners waiting in queue."""
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        depth: int = await redis.llen(queue_key)  # type: ignore[misc]
        return depth

    async def get_slot_utilization(self, config_id: UUID, keys_info: list[dict[str, Any]] | None = None, default_key: str | None = None) -> dict[str, int]:
        """
        Get slot utilization: active, total, available.
        """
        total = self._get_total_capacity(keys_info, default_key)
        active = await self._get_current_usage(config_id, keys_info, default_key)
        
        return {
            "active": active,
            "total": total,
            "available": max(0, total - active)
        }

    async def recover_stale_owners(self, config_id: UUID, keys_info: list[dict[str, Any]] | None = None, default_key: str | None = None, max_age_seconds: int = 3600) -> int:
        """
        Recover slots from stale owners that have exceeded max_age_seconds.
        
        This handles two cases:
        1. Stale queue entries - owners waiting too long in queue
        2. Stale active owners - owners holding slots but abandoned
        
        Returns count of recovered slots.
        
        After recovery, attempts to advance queued owners to available slots.
        
        Safety guarantees:
        - Idempotent: Safe to call multiple times
        - Never drives counter negative
        - Distinguishes stale queue owners from stale active owners
        """
        redis = get_redis()
        queue_key = self._get_queue_key(config_id)
        current_time = time.time()
        
        recovered = 0
        
        # Phase 1: Recover stale ACTIVE owners (holding slots)
        owner_pattern = f"{self.OWNER_KEY_PREFIX}:{config_id}:*"
        
        try:
            owner_keys: list[str] = []
            async for key in redis.scan_iter(match=owner_pattern):  # type: ignore[misc]
                owner_keys.append(key)
        except AttributeError:
            owner_keys = []
        
        stale_active_owners: list[tuple[str, dict[str, str]]] = []
        for owner_key in owner_keys:
            metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
            if not metadata:
                continue
            
            # Only check owners that have acquired a slot (have acquired_at)
            acquired_at = metadata.get("acquired_at")
            if acquired_at:
                age = current_time - float(acquired_at)
                if age >= max_age_seconds:
                    stale_active_owners.append((owner_key, metadata))
                    logger.debug(f"Found stale active owner: {owner_key}, age={age:.1f}s")
        
        for owner_key, metadata in stale_active_owners:
            api_key = metadata.get("api_key")
            if api_key:
                key_hash = self._get_key_hash(api_key)
                redis_key = self._get_redis_key(config_id, key_hash)
                
                # Idempotent recovery: Check current value before decrementing
                # This prevents double-recovery if owner was already released
                current_val = await redis.get(redis_key)
                if current_val and int(current_val) > 0:
                    current: int = await redis.decr(redis_key)  # type: ignore[misc]
                    if current < 0:
                        await redis.set(redis_key, 0)
                        logger.warning(f"Slot counter went negative for {redis_key}, reset to 0")
                    else:
                        recovered += 1
                        logger.info(f"Recovered stale active owner slot for config={config_id}, key={metadata.get('key_id')}")
                else:
                    # Slot already released by normal means - just clean up metadata
                    logger.debug(f"Stale owner slot already released, cleaning metadata only: {metadata.get('key_id')}")
            
            # Always clean up stale owner metadata
            await redis.delete(owner_key)
        
        # Phase 2: Recover stale QUEUED owners (waiting in queue)
        queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
        if queue:
            stale_queue: list[str] = []
            valid_queue: list[str] = []
            
            for owner_token in queue:
                owner_key = self._get_owner_key(config_id, owner_token)
                metadata = await redis.hgetall(owner_key)  # type: ignore[misc]
                
                # No metadata = orphaned queue entry - treat as stale
                if not metadata:
                    stale_queue.append(owner_token)
                    logger.debug(f"Found orphaned queue entry: {owner_token}")
                    continue
                
                # Check enqueued_at timestamp for age
                enqueued_at = metadata.get("enqueued_at")
                if enqueued_at:
                    age = current_time - float(enqueued_at)
                    if age >= max_age_seconds:
                        stale_queue.append(owner_token)
                        await redis.delete(owner_key)
                        recovered += 1
                        logger.info(f"Recovered stale queued owner: {owner_token}, age={age:.1f}s")
                        continue
                
                valid_queue.append(owner_token)
            
            # Rebuild queue with only valid entries (atomic replacement)
            await redis.delete(queue_key)
            if valid_queue:
                await redis.rpush(queue_key, *valid_queue)  # type: ignore[misc]
        
        # Phase 3: Advance queued owners to fill recovered slots
        if recovered > 0:
            total_capacity = self._get_total_capacity(keys_info, default_key)
            new_usage = await self._get_current_usage(config_id, keys_info, default_key)
            
            while new_usage < total_capacity:
                next_owner = await self.dequeue_owner(config_id)
                if not next_owner:
                    break
                
                acquired = await self.try_acquire_for_queued_owner(
                    config_id, keys_info, default_key, next_owner
                )
                if acquired:
                    logger.info(f"Advanced queued owner {next_owner} after stale recovery for config={config_id}")
                    new_usage = await self._get_current_usage(config_id, keys_info, default_key)
                else:
                    # Failed to acquire (maybe capacity changed), re-queue
                    await self.enqueue_owner(config_id, next_owner)
                    logger.warning(f"Could not advance owner {next_owner}, returned to queue")
                    break
        
        if recovered > 0:
            logger.info(f"Recovered {recovered} stale owners from config={config_id}")
        
        return recovered

    async def cleanup_zombie_slots(
        self,
        config_id: UUID,
        keys_info: list[dict[str, Any]] | None = None,
        default_key: str | None = None
    ) -> dict[str, int]:
        """
        Clean up zombie slots: concurrency counters that show usage but have no owner metadata.
        
        This handles the case where:
        1. An owner acquired a slot (counter incremented)
        2. The owner died/crashed without releasing the slot
        3. The owner metadata was cleaned up (TTL expired) but counter still shows usage
        
        Unlike recover_stale_owners which uses timestamps, this detects "orphaned" slots
        where the counter doesn't match any known owner.
        
        Returns dict with:
        - 'zombies_found': number of zombie slots detected
        - 'zombies_cleaned': number of zombie slots actually cleaned
        - 'orphaned_queue': queue entries with no metadata
        
        Safety guarantees:
        - Idempotent: Safe to call multiple times
        - Never cleans slots with valid owners
        - Reports but doesn't clean queue entries without metadata
        """
        redis = get_redis()
        result = {
            "zombies_found": 0,
            "zombies_cleaned": 0,
            "orphaned_queue": 0,
        }
        
        # Build set of valid active owner tokens from metadata
        valid_active_owners: set[str] = set()
        owner_pattern = f"{self.OWNER_KEY_PREFIX}:{config_id}:*"
        
        try:
            owner_keys: list[str] = []
            async for key in redis.scan_iter(match=owner_pattern):  # type: ignore[misc]
                owner_keys.append(key)
        except AttributeError:
            owner_keys = []
        
        for owner_key in owner_keys:
            metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
            if metadata and metadata.get("acquired_at"):
                # This owner has acquired a slot - extract token from key
                # Key format: ai_owner:{config_id}:{token}
                token = owner_key.split(":")[-1]
                valid_active_owners.add(token)
        
        # Get all candidate API keys to check
        candidates: list[str] = []
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    candidates.append(k["api_key"])
        if not candidates and default_key:
            candidates.append(default_key)
        
        # Check each key's concurrency counter against valid owners
        for api_key in candidates:
            key_hash = self._get_key_hash(api_key)
            redis_key = self._get_redis_key(config_id, key_hash)
            
            current_val = await redis.get(redis_key)
            if not current_val or int(current_val) == 0:
                continue
            
            usage_count = int(current_val)
            
            # If counter shows usage but no valid owner, it's a zombie
            if usage_count > 0 and not valid_active_owners:
                # Zombie detected - clean it up
                await redis.set(redis_key, 0)
                result["zombies_found"] += usage_count
                result["zombies_cleaned"] += usage_count
                logger.warning(f"Cleaned zombie slot: config={config_id}, key_hash={key_hash}, was_using={usage_count}")
            elif usage_count > 0:
                # There's usage and there are valid owners
                # Check if there's a mismatch (owners don't match usage count)
                # This is a best-effort check - we can't know exact mapping
                logger.debug(f"Slot in use: {redis_key}, count={usage_count}, valid_owners={len(valid_active_owners)}")
        
        # Clean up orphaned queue entries (queue entries without metadata)
        queue_key = self._get_queue_key(config_id)
        queue: list[str] = await redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
        
        if queue:
            valid_queue: list[str] = []
            for owner_token in queue:
                owner_key = self._get_owner_key(config_id, owner_token)
                metadata = await redis.hgetall(owner_key)  # type: ignore[misc]
                
                if not metadata:
                    # Orphaned queue entry - no metadata exists
                    result["orphaned_queue"] += 1
                    logger.debug(f"Found orphaned queue entry: {owner_token}")
                    continue
                
                valid_queue.append(owner_token)
            
            # Rebuild queue to remove orphans
            if len(valid_queue) != len(queue):
                await redis.delete(queue_key)
                if valid_queue:
                    await redis.rpush(queue_key, *valid_queue)  # type: ignore[misc]
                logger.info(f"Cleaned queue: removed {len(queue) - len(valid_queue)} orphaned entries")
        
        # After cleaning zombies, try to advance queue if capacity available
        if result["zombies_cleaned"] > 0:
            total_capacity = self._get_total_capacity(keys_info, default_key)
            new_usage = await self._get_current_usage(config_id, keys_info, default_key)
            
            while new_usage < total_capacity:
                next_owner = await self.dequeue_owner(config_id)
                if not next_owner:
                    break
                
                acquired = await self.try_acquire_for_queued_owner(
                    config_id, keys_info, default_key, next_owner
                )
                if acquired:
                    logger.info(f"Advanced queued owner {next_owner} after zombie cleanup for config={config_id}")
                    new_usage = await self._get_current_usage(config_id, keys_info, default_key)
                else:
                    await self.enqueue_owner(config_id, next_owner)
                    break
        
        if result["zombies_found"] > 0 or result["orphaned_queue"] > 0:
            logger.info(f"Zombie cleanup for config={config_id}: found={result['zombies_found']}, cleaned={result['zombies_cleaned']}, orphaned_queue={result['orphaned_queue']}")
        
        return result

    async def acquire_key(
        self, 
        config_id: UUID, 
        keys_info: list[dict[str, Any]] | None, 
        default_key: str | None,
        owner_token: str | None = None,
        task_id: str | None = None
    ) -> dict[str, Any] | None:
        """
        Choose an available API key based on concurrency limits.
        
        Returns:
        - If slot available: dict with api_key, limit, id, owner_token
        - If slot exhausted: dict with queue_position (owner is queued)
        - If no keys configured: None
        
        For queueable flows, pass owner_token to track position.
        If no owner_token provided, one will be generated.
        """
        redis = get_redis()
        
        candidates: list[dict[str, Any]] = []
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    candidates.append({
                        "api_key": k["api_key"],
                        "limit": k.get("concurrency_limit", 5),
                        "id": str(k.get("id", "none"))
                    })
        
        if not candidates and default_key:
            candidates.append({
                "api_key": default_key,
                "limit": 5,
                "id": "default"
            })
            
        if not candidates:
            return None

        total_capacity = self._get_total_capacity(keys_info, default_key)
        current_usage = await self._get_current_usage(config_id, keys_info, default_key)
        
        if current_usage < total_capacity:
            for cand in candidates:
                key_hash = self._get_key_hash(cand["api_key"])
                redis_key = self._get_redis_key(config_id, key_hash)
                
                val = await redis.get(redis_key)
                key_usage = int(val) if val else 0
                
                if key_usage < cand["limit"]:
                    new_val: int = await redis.incr(redis_key)  # type: ignore[misc]
                    
                    if new_val > cand["limit"]:
                        await redis.decr(redis_key)
                        continue
                    
                    await redis.expire(redis_key, self.OWNER_METADATA_TTL)
                    
                    token = owner_token or self._generate_owner_token()
                    
                    owner_key = self._get_owner_key(config_id, token)
                    await redis.hset(owner_key, mapping={  # type: ignore[misc]
                        "owner_token": token,
                        "api_key": cand["api_key"],
                        "key_id": cand["id"],
                        "acquired_at": str(time.time()),
                        "task_id": task_id or "",
                    })
                    await redis.expire(owner_key, self.OWNER_METADATA_TTL)
                    
                    logger.info(f"Acquired key id={cand['id']} for config={config_id} (usage={new_val}/{total_capacity})")
                    
                    return {
                        "api_key": cand["api_key"],
                        "limit": cand["limit"],
                        "id": cand["id"],
                        "owner_token": token,
                        "key_id": cand["id"],
                    }
        
        token = owner_token or self._generate_owner_token()
        queue_position = await self.enqueue_owner(config_id, token, {"task_id": task_id})
        
        logger.info(f"No slots available for config={config_id}, queued with position={queue_position}")
        
        return {
            "queue_position": queue_position,
            "owner_token": token,
            "queued": True,
        }

    async def acquire_key_with_queue(
        self,
        config_id: UUID,
        keys_info: list[dict[str, Any]] | None,
        default_key: str | None,
        task_id: str | None = None
    ) -> dict[str, Any]:
        """
        Explicitly queue a request without trying to acquire a slot.
        Returns queue placement info.
        
        This is useful when you know you want to queue rather than
        trying to acquire first.
        """
        token = self._generate_owner_token()
        queue_position = await self.enqueue_owner(config_id, token, {"task_id": task_id})
        
        return {
            "queue_position": queue_position,
            "owner_token": token,
            "queued": True,
        }

    async def try_acquire_for_queued_owner(
        self,
        config_id: UUID,
        keys_info: list[dict[str, Any]] | None,
        default_key: str | None,
        owner_token: str
    ) -> dict[str, Any] | None:
        """
        Try to acquire a slot for an already-queued owner.
        
        Called when a slot becomes available to give it to the next in queue.
        Returns slot info if acquired, None if still no capacity.
        """
        redis = get_redis()
        
        total_capacity = self._get_total_capacity(keys_info, default_key)
        current_usage = await self._get_current_usage(config_id, keys_info, default_key)
        
        if current_usage >= total_capacity:
            return None
        
        candidates: list[dict[str, Any]] = []
        if keys_info:
            for k in keys_info:
                if k.get("enabled", True):
                    candidates.append({
                        "api_key": k["api_key"],
                        "limit": k.get("concurrency_limit", 5),
                        "id": str(k.get("id", "none"))
                    })
        
        if not candidates and default_key:
            candidates.append({
                "api_key": default_key,
                "limit": 5,
                "id": "default"
            })
        
        for cand in candidates:
            key_hash = self._get_key_hash(cand["api_key"])
            redis_key = self._get_redis_key(config_id, key_hash)
            
            val = await redis.get(redis_key)
            key_usage = int(val) if val else 0
            
            if key_usage < cand["limit"]:
                new_val: int = await redis.incr(redis_key)  # type: ignore[misc]
                
                if new_val > cand["limit"]:
                    await redis.decr(redis_key)
                    continue
                
                await redis.expire(redis_key, self.OWNER_METADATA_TTL)
                
                owner_key = self._get_owner_key(config_id, owner_token)
                await redis.hset(owner_key, mapping={  # type: ignore[misc]
                    "owner_token": owner_token,
                    "api_key": cand["api_key"],
                    "key_id": cand["id"],
                    "acquired_at": str(time.time()),
                })
                await redis.expire(owner_key, self.OWNER_METADATA_TTL)
                
                return {
                    "api_key": cand["api_key"],
                    "limit": cand["limit"],
                    "id": cand["id"],
                    "owner_token": owner_token,
                    "key_id": cand["id"],
                }
        
        return None

    async def release_key(
        self, 
        config_id: UUID, 
        api_key: str, 
        owner_token: str | None = None,
        keys_info: list[dict[str, Any]] | None = None,
        default_key: str | None = None
    ) -> None:
        """
        Release a slot. If there's a queued owner waiting, advance them.
        
        Args:
            config_id: The model config UUID
            api_key: The API key being released
            owner_token: Optional owner token for verification
            keys_info: Key info for capacity calculation
            default_key: Default key if no multi-key config
        """
        if not api_key:
            return
            
        redis = get_redis()
        key_hash = self._get_key_hash(api_key)
        redis_key = self._get_redis_key(config_id, key_hash)
        
        current: int = await redis.decr(redis_key)  # type: ignore[misc]
        if current < 0:
            await redis.set(redis_key, 0)
        
        logger.info(f"Released key for config={config_id} (concurrency={max(0, current)})")
        
        total_capacity = self._get_total_capacity(keys_info, default_key)
        new_usage = await self._get_current_usage(config_id, keys_info, default_key)
        
        if new_usage < total_capacity:
            next_owner = await self.dequeue_owner(config_id)
            if next_owner:
                acquired = await self.try_acquire_for_queued_owner(
                    config_id, keys_info, default_key, next_owner
                )
                if acquired:
                    logger.info(f"Advanced queued owner {next_owner} to slot for config={config_id}")
                else:
                    await self.enqueue_owner(config_id, next_owner)
                    logger.warning(f"Could not advance owner {next_owner}, returned to queue")

    async def get_assigned_key_for_owner(
        self,
        config_id: UUID,
        owner_token: str,
    ) -> dict[str, str] | None:
        """
        Retrieve the assigned API key info for an owner token.
        
        This method looks up owner metadata and returns the api_key that was
        assigned when the slot was acquired. Returns None if owner not found
        or slot hasn't been acquired yet.
        
        Returns:
            dict with api_key, key_id if found, None otherwise
        """
        redis = get_redis()
        owner_key = self._get_owner_key(config_id, owner_token)
        metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
        
        if not metadata:
            return None
        
        api_key = metadata.get("api_key")
        if not api_key:
            return None
        
        return {
            "api_key": api_key,
            "key_id": metadata.get("key_id", ""),
        }

    async def release_key_with_owner(
        self,
        config_id: str,
        owner_token: str,
        keys_info: list[dict[str, Any]] | None = None,
        default_key: str | None = None,
    ) -> bool:
        """
        Release a slot using owner token verification.
        
        This method looks up the api_key from the owner metadata,
        then releases the slot. If owner_token doesn't match any
        known owner, the release is skipped.
        
        Args:
            config_id: The model config UUID as string
            owner_token: The owner token from acquire_key
            keys_info: Key info for capacity calculation
            default_key: Default key if no multi-key config
            
        Returns:
            True if slot was released, False if owner not found
        """
        redis = get_redis()
        config_uuid = UUID(config_id) if isinstance(config_id, str) else config_id
        
        # Look up owner metadata to get the api_key
        owner_key = self._get_owner_key(config_uuid, owner_token)
        metadata: dict[str, str] = await redis.hgetall(owner_key)  # type: ignore[misc]
        
        if not metadata:
            logger.warning(f"Owner token {owner_token} not found for config={config_id}")
            return False
        
        api_key = metadata.get("api_key")
        if not api_key:
            logger.warning(f"No api_key found for owner {owner_token}")
            return False
        
        # Release the slot using the api_key
        key_hash = self._get_key_hash(api_key)
        redis_key = self._get_redis_key(config_uuid, key_hash)
        
        current: int = await redis.decr(redis_key)  # type: ignore[misc]
        if current < 0:
            await redis.set(redis_key, 0)
        
        # Clean up owner metadata
        await redis.delete(owner_key)
        
        logger.info(f"Released slot for config={config_id} owner={owner_token} (concurrency={max(0, current)})")
        
        # Advance queued owners if capacity available
        total_capacity = self._get_total_capacity(keys_info, default_key)
        new_usage = await self._get_current_usage(config_uuid, keys_info, default_key)
        
        if new_usage < total_capacity:
            next_owner = await self.dequeue_owner(config_uuid)
            if next_owner:
                acquired = await self.try_acquire_for_queued_owner(
                    config_uuid, keys_info, default_key, next_owner
                )
                if acquired:
                    logger.info(f"Advanced queued owner {next_owner} to slot for config={config_id}")
                else:
                    await self.enqueue_owner(config_uuid, next_owner)
                    logger.warning(f"Could not advance owner {next_owner}, returned to queue")
        
        return True

concurrency_manager = AIKeyConcurrencyManager()
