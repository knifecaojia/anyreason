import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tasks.redis_client import get_redis


async def main() -> None:
    r = get_redis()
    try:
        pong = await r.ping()
        print("redis ping:", pong)
    finally:
        try:
            await r.aclose()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())

