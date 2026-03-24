from __future__ import annotations

import logging

from redis.asyncio import ConnectionPool
from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

# 全局连接池，最大连接数限制为 50，避免耗尽端口
_pool: ConnectionPool | None = None


def get_connection_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        logger.info(f"Creating Redis connection pool: {settings.REDIS_URL}")
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=50,  # 限制最大连接数
            socket_connect_timeout=5,
            socket_timeout=30,
            retry_on_timeout=True,
            health_check_interval=30,
        )
    return _pool


def get_redis() -> Redis:
    """
    获取 Redis 客户端实例。
    复用全局连接池，确保连接数可控。
    """
    pool = get_connection_pool()
    return Redis(connection_pool=pool)


async def close_redis() -> None:
    """
    显式关闭 Redis 连接池，释放资源。
    """
    global _pool
    if _pool is not None:
        logger.info("Closing Redis connection pool...")
        await _pool.aclose()
        _pool = None
