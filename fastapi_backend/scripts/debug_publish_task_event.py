import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tasks.queue import publish_task_event


async def main() -> None:
    t0 = time.monotonic()
    await publish_task_event(payload={"type": "debug", "ts": time.time()})
    dt = time.monotonic() - t0
    print(f"publish_task_event ok: {dt:.3f}s")


if __name__ == "__main__":
    asyncio.run(main())

