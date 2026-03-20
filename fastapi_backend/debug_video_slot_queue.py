"""
Debug script for video slot queue health inspection.

This script provides an operator-friendly CLI for diagnosing queue health
without requiring direct Redis shell access.

USAGE:
    python debug_video_slot_queue.py [command]

COMMANDS:
    health     - Show combined queue health summary (default)
    depth      - Show queue depth per model config
    utilization - Show slot utilization per model config
    stale      - Show stale slot candidates
    owners     - Show active slot owners with metadata

SECURITY:
    - This script redacts all plaintext API keys
    - Only safe identifiers are exposed: key IDs, hashes, counts, timestamps
    - No raw Redis data is exposed to stdout

EXAMPLES:
    python debug_video_slot_queue.py health
    python debug_video_slot_queue.py depth
    python debug_video_slot_queue.py stale
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

# Ensure we're using the right event loop policy on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def _parse_timestamp(ts: str | None) -> datetime | None:
    """Parse Unix timestamp string to datetime."""
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    except (ValueError, TypeError):
        return None


def _format_timestamp(dt: datetime | None) -> str:
    """Format datetime for display."""
    if dt is None:
        return "N/A"
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def _safe_key_id(key_info: dict[str, Any] | None) -> str | None:
    """Extract safe key identifier from key info (never expose plaintext)."""
    if key_info is None:
        return None
    return key_info.get("id") or key_info.get("key_id") or key_info.get("key_hash")


class VideoSlotQueueInspector:
    """
    Inspector for video slot queue health.
    
    Provides safe, redacted access to queue diagnostics without exposing
    plaintext API keys or raw Redis internals.
    """

    def __init__(self):
        from app.tasks.redis_client import get_redis
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        from app.database import async_session_maker
        from sqlalchemy import select

        self.redis = get_redis()
        self.manager = AIKeyConcurrencyManager()
        self.async_session_maker = async_session_maker
        self._sql_select = select

    async def get_all_model_configs(self) -> list[dict[str, Any]]:
        """Get all model configs for queue inspection."""
        async with self.async_session_maker() as db:
            from app.models import AIModelConfig
            result = await db.execute(self._sql_select(AIModelConfig))
            configs = list(result.scalars().all())
            
            # Convert to safe dict format (redacted)
            safe_configs = []
            for config in configs:
                safe_configs.append({
                    "id": str(config.id),
                    "name": getattr(config, "name", "Unknown"),
                    "provider": getattr(config, "provider", "Unknown"),
                    "model": getattr(config, "model", "Unknown"),
                    # Keys info - safe identifiers only
                    "keys_info": self._redact_keys_info(getattr(config, "api_keys_info", None)),
                })
            return safe_configs

    def _redact_keys_info(self, keys_info: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        """Redact API keys from keys_info - return only safe identifiers."""
        if not keys_info:
            return []
        
        redacted = []
        for k in keys_info:
            redacted.append({
                "id": k.get("id") or k.get("key_id") or "unknown",
                "enabled": k.get("enabled", True),
                "concurrency_limit": k.get("concurrency_limit", 5),
                # EXPLICITLY EXCLUDED: api_key, plaintext key values
            })
        return redacted

    async def get_queue_depth(self, config_id: UUID) -> dict[str, Any]:
        """Get queue depth for a config."""
        queue_key = self.manager._get_queue_key(config_id)
        depth: int = await self.redis.llen(queue_key)  # type: ignore[misc]
        
        oldest_at: datetime | None = None
        newest_at: datetime | None = None
        
        if depth > 0:
            queue: list[str] = await self.redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
            timestamps: list[float] = []
            
            for owner_token in queue:
                owner_key = self.manager._get_owner_key(config_id, owner_token)
                metadata: dict[str, str] = await self.redis.hgetall(owner_key)  # type: ignore[misc]
                if metadata and metadata.get("enqueued_at"):
                    try:
                        ts = float(metadata["enqueued_at"])
                        timestamps.append(ts)
                    except (ValueError, TypeError):
                        pass
            
            if timestamps:
                oldest_at = datetime.fromtimestamp(min(timestamps), tz=timezone.utc)
                newest_at = datetime.fromtimestamp(max(timestamps), tz=timezone.utc)
        
        return {
            "config_id": str(config_id),
            "queue_depth": depth,
            "oldest_queued_at": _format_timestamp(oldest_at),
            "newest_queued_at": _format_timestamp(newest_at),
        }

    async def get_slot_utilization(
        self,
        config_id: UUID,
        keys_info: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Get slot utilization for a config."""
        total = self.manager._get_total_capacity(keys_info, None)
        active = await self.manager._get_current_usage(config_id, keys_info, None)
        
        return {
            "config_id": str(config_id),
            "active": active,
            "total": total,
            "available": max(0, total - active),
            "keys": keys_info,  # Already redacted
        }

    async def get_active_owners(self, config_id: UUID) -> list[dict[str, Any]]:
        """Get all active slot owners for a config."""
        current_time = time.time()
        owner_pattern = f"{self.manager.OWNER_KEY_PREFIX}:{config_id}:*"
        
        owners: list[dict[str, Any]] = []
        
        try:
            owner_keys: list[str] = []
            async for key in self.redis.scan_iter(match=owner_pattern):  # type: ignore[misc]
                owner_keys.append(key)
        except AttributeError:
            owner_keys = []
        
        for owner_key in owner_keys:
            metadata: dict[str, str] = await self.redis.hgetall(owner_key)  # type: ignore[misc]
            if metadata and metadata.get("acquired_at"):
                acquired_at = float(metadata.get("acquired_at", 0))
                
                # REDACTED: Only safe identifiers
                owners.append({
                    "owner_token": owner_key.split(":")[-1],  # Safe - not a secret
                    "key_id": metadata.get("key_id"),  # Safe identifier only
                    "task_id": metadata.get("task_id"),
                    "enqueued_at": _format_timestamp(_parse_timestamp(metadata.get("enqueued_at"))),
                    "acquired_at": _format_timestamp(_parse_timestamp(metadata.get("acquired_at"))),
                    "age_seconds": current_time - acquired_at,
                    # EXPLICITLY EXCLUDED: api_key (plaintext)
                })
        
        return owners

    async def get_stale_owners(
        self,
        config_id: UUID,
        queue_threshold: float = 3600,  # 1 hour
        active_threshold: float = 7200,  # 2 hours
    ) -> dict[str, Any]:
        """Get stale slot candidates for diagnostics."""
        current_time = time.time()
        stale_queue: list[dict[str, Any]] = []
        stale_active: list[dict[str, Any]] = []
        
        # Check stale queued entries
        queue_key = self.manager._get_queue_key(config_id)
        queue: list[str] = await self.redis.lrange(queue_key, 0, -1)  # type: ignore[misc]
        
        for owner_token in queue:
            owner_key = self.manager._get_owner_key(config_id, owner_token)
            metadata: dict[str, str] = await self.redis.hgetall(owner_key)  # type: ignore[misc]
            
            enqueued_at = metadata.get("enqueued_at")
            if enqueued_at:
                try:
                    age = current_time - float(enqueued_at)
                    if age >= queue_threshold:
                        stale_queue.append({
                            "owner_token": owner_token,
                            "key_id": metadata.get("key_id"),
                            "task_id": metadata.get("task_id"),
                            "enqueued_at": _format_timestamp(_parse_timestamp(enqueued_at)),
                            "age_seconds": age,
                            "threshold_seconds": queue_threshold,
                        })
                except (ValueError, TypeError):
                    pass
        
        # Check stale active owners
        active_owners = await self.get_active_owners(config_id)
        for owner in active_owners:
            age = owner.get("age_seconds", 0)
            if age >= active_threshold:
                stale_active.append({
                    "owner_token": owner["owner_token"],
                    "key_id": owner["key_id"],
                    "task_id": owner["task_id"],
                    "acquired_at": owner["acquired_at"],
                    "age_seconds": age,
                    "threshold_seconds": active_threshold,
                })
        
        return {
            "config_id": str(config_id),
            "stale_queue": stale_queue,
            "stale_active": stale_active,
            "total_stale": len(stale_queue) + len(stale_active),
        }

    async def get_health_summary(self) -> dict[str, Any]:
        """Get combined queue health summary."""
        configs = await self.get_all_model_configs()
        
        config_summaries: dict[str, Any] = {}
        all_stale: list[dict[str, Any]] = []
        
        total_queue_depth = 0
        total_active = 0
        total_capacity = 0
        
        for config in configs:
            config_id = UUID(config["id"])
            keys_info = config.get("keys_info")
            
            # Queue depth
            depth_info = await self.get_queue_depth(config_id)
            queue_depth = depth_info["queue_depth"]
            
            # Slot utilization
            util_info = await self.get_slot_utilization(config_id, keys_info)
            active = util_info["active"]
            total = util_info["total"]
            
            # Stale detection
            stale_info = await self.get_stale_owners(config_id)
            
            config_summary = {
                "config_id": str(config_id),
                "name": config.get("name"),
                "provider": config.get("provider"),
                "model": config.get("model"),
                "queue_depth": queue_depth,
                "active": active,
                "total": total,
                "available": max(0, total - active),
                "stale_queue_count": len(stale_info["stale_queue"]),
                "stale_active_count": len(stale_info["stale_active"]),
                "keys": keys_info,  # Already redacted
            }
            config_summaries[str(config_id)] = config_summary
            
            total_queue_depth += queue_depth
            total_active += active
            total_capacity += total
            
            all_stale.extend(stale_info["stale_queue"])
            all_stale.extend(stale_info["stale_active"])
        
        return {
            "summary": {
                "total_queue_depth": total_queue_depth,
                "total_active": total_active,
                "total_capacity": total_capacity,
                "total_available": max(0, total_capacity - total_active),
                "total_configs": len(configs),
                "total_stale": len(all_stale),
            },
            "configs": config_summaries,
            "stale_owners": all_stale,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


def print_health_report(report: dict[str, Any]) -> None:
    """Pretty print health report."""
    print("\n" + "=" * 60)
    print("VIDEO SLOT QUEUE HEALTH REPORT")
    print("=" * 60)
    
    summary = report["summary"]
    print(f"\nOVERVIEW:")
    print(f"  Total Configs:     {summary['total_configs']}")
    print(f"  Total Queue Depth: {summary['total_queue_depth']}")
    print(f"  Total Active:      {summary['total_active']}")
    print(f"  Total Capacity:    {summary['total_capacity']}")
    print(f"  Total Available:   {summary['total_available']}")
    print(f"  Total Stale:       {summary['total_stale']}")
    print(f"  Generated At:     {report['generated_at']}")
    
    print(f"\nPER-CONFIG DETAILS:")
    print("-" * 60)
    
    for config_id, info in report["configs"].items():
        print(f"\nConfig: {info.get('name', 'Unknown')} ({info.get('provider', '?')}/{info.get('model', '?')})")
        print(f"  ID:               {config_id}")
        print(f"  Queue Depth:      {info['queue_depth']}")
        print(f"  Active Slots:     {info['active']}/{info['total']} (available: {info['available']})")
        print(f"  Stale Queue:      {info['stale_queue_count']}")
        print(f"  Stale Active:     {info['stale_active_count']}")
        
        if info.get("keys"):
            print(f"  API Keys:         {len(info['keys'])} configured")
            for key in info["keys"]:
                status = "enabled" if key.get("enabled", True) else "disabled"
                print(f"    - {key['id']}: limit={key['concurrency_limit']}, {status}")
    
    if report["stale_owners"]:
        print(f"\nSTALE OWNERS ({len(report['stale_owners'])}):")
        print("-" * 60)
        for stale in report["stale_owners"][:10]:  # Show first 10
            location = "queue" if stale.get("age_seconds", 0) < 7200 else "active"
            print(f"  Token: {stale['owner_token'][:16]}... | {location} | age={stale['age_seconds']:.0f}s | key={stale.get('key_id', '?')}")
        if len(report["stale_owners"]) > 10:
            print(f"  ... and {len(report['stale_owners']) - 10} more")


def print_depth_report(report: list[dict[str, Any]]) -> None:
    """Pretty print depth report."""
    print("\n" + "=" * 60)
    print("QUEUE DEPTH REPORT")
    print("=" * 60)
    
    for depth_info in report:
        print(f"\nConfig: {depth_info['config_id']}")
        print(f"  Queue Depth:    {depth_info['queue_depth']}")
        print(f"  Oldest Queued:  {depth_info['oldest_queued_at']}")
        print(f"  Newest Queued:  {depth_info['newest_queued_at']}")


def print_utilization_report(report: list[dict[str, Any]]) -> None:
    """Pretty print utilization report."""
    print("\n" + "=" * 60)
    print("SLOT UTILIZATION REPORT")
    print("=" * 60)
    
    for util_info in report:
        print(f"\nConfig: {util_info['config_id']}")
        print(f"  Active:    {util_info['active']}")
        print(f"  Total:     {util_info['total']}")
        print(f"  Available: {util_info['available']}")
        
        if util_info.get("keys"):
            print(f"  Keys:      {len(util_info['keys'])} configured")
            for key in util_info["keys"]:
                status = "enabled" if key.get("enabled", True) else "disabled"
                print(f"    - {key['id']}: limit={key['concurrency_limit']}, {status}")


def print_stale_report(report: list[dict[str, Any]]) -> None:
    """Pretty print stale report."""
    print("\n" + "=" * 60)
    print("STALE SLOT CANDIDATES REPORT")
    print("=" * 60)
    
    total_stale = 0
    for stale_info in report:
        config_id = stale_info["config_id"]
        sq = stale_info["stale_queue"]
        sa = stale_info["stale_active"]
        total = stale_info["total_stale"]
        total_stale += total
        
        print(f"\nConfig: {config_id}")
        print(f"  Stale Queue Entries: {len(sq)}")
        for entry in sq[:5]:
            print(f"    Token: {entry['owner_token'][:16]}... | age={entry['age_seconds']:.0f}s | key={entry.get('key_id', '?')}")
        if len(sq) > 5:
            print(f"    ... and {len(sq) - 5} more")
        
        print(f"  Stale Active Owners:  {len(sa)}")
        for entry in sa[:5]:
            print(f"    Token: {entry['owner_token'][:16]}... | age={entry['age_seconds']:.0f}s | key={entry.get('key_id', '?')}")
        if len(sa) > 5:
            print(f"    ... and {len(sa) - 5} more")
    
    print(f"\n{'=' * 60}")
    print(f"TOTAL STALE: {total_stale}")


def print_owners_report(report: list[tuple[str, list[dict[str, Any]]]]) -> None:
    """Pretty print active owners report."""
    print("\n" + "=" * 60)
    print("ACTIVE SLOT OWNERS REPORT")
    print("=" * 60)
    
    total_owners = 0
    for config_id, owners in report:
        total_owners += len(owners)
        print(f"\nConfig: {config_id}")
        print(f"  Active Owners: {len(owners)}")
        
        if owners:
            print(f"  {'Token':<18} {'Key ID':<12} {'Age (s)':<10} {'Task ID'}")
            print(f"  {'-' * 18} {'-' * 12} {'-' * 10} {'-' * 36}")
            for owner in owners[:10]:
                token = owner["owner_token"][:16] + "..." if len(owner["owner_token"]) > 16 else owner["owner_token"]
                key_id = owner.get("key_id", "?") or "?"
                age = owner.get("age_seconds", 0)
                task_id = owner.get("task_id", "?") or "?"
                if task_id != "?" and len(task_id) > 32:
                    task_id = task_id[:32] + "..."
                print(f"  {token:<18} {key_id:<12} {age:<10.0f} {task_id}")
            if len(owners) > 10:
                print(f"  ... and {len(owners) - 10} more")
    
    print(f"\n{'=' * 60}")
    print(f"TOTAL ACTIVE OWNERS: {total_owners}")


async def main_async(args: argparse.Namespace) -> int:
    """Main async entry point."""
    inspector = VideoSlotQueueInspector()
    
    try:
        if args.command == "health":
            report = await inspector.get_health_summary()
            print_health_report(report)
            
            # Also print JSON for scripting
            if args.json:
                print("\n" + json.dumps(report, indent=2))
            return 0
        
        elif args.command == "depth":
            configs = await inspector.get_all_model_configs()
            report = []
            for config in configs:
                depth_info = await inspector.get_queue_depth(UUID(config["id"]))
                report.append(depth_info)
            print_depth_report(report)
            
            if args.json:
                print("\n" + json.dumps(report, indent=2))
            return 0
        
        elif args.command == "utilization":
            configs = await inspector.get_all_model_configs()
            report = []
            for config in configs:
                util_info = await inspector.get_slot_utilization(
                    UUID(config["id"]),
                    config.get("keys_info")
                )
                report.append(util_info)
            print_utilization_report(report)
            
            if args.json:
                print("\n" + json.dumps(report, indent=2))
            return 0
        
        elif args.command == "stale":
            configs = await inspector.get_all_model_configs()
            report = []
            for config in configs:
                stale_info = await inspector.get_stale_owners(UUID(config["id"]))
                report.append(stale_info)
            print_stale_report(report)
            
            if args.json:
                print("\n" + json.dumps(report, indent=2))
            return 0
        
        elif args.command == "owners":
            configs = await inspector.get_all_model_configs()
            report = []
            for config in configs:
                owners = await inspector.get_active_owners(UUID(config["id"]))
                report.append((config["id"], owners))
            print_owners_report(report)
            
            if args.json:
                print("\n" + json.dumps(dict(report), indent=2))
            return 0
        
        else:
            print(f"Unknown command: {args.command}")
            return 1
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Video slot queue health inspection tool for operators",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
SECURITY NOTES:
  - This tool redacts all plaintext API keys
  - Only safe identifiers (IDs, hashes, counts) are exposed
  - No raw Redis data or secrets are printed to stdout

EXAMPLES:
  python debug_video_slot_queue.py health
  python debug_video_slot_queue.py depth
  python debug_video_slot_queue.py stale --json
  python debug_video_slot_queue.py owners
        """
    )
    
    parser.add_argument(
        "command",
        nargs="?",
        default="health",
        choices=["health", "depth", "utilization", "stale", "owners"],
        help="Command to run (default: health)",
    )
    
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Also output raw JSON for scripting",
    )
    
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
