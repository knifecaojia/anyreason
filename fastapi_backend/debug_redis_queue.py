
import asyncio
import os
import sys
from app.config import settings
from app.tasks.redis_client import get_redis
from app.database import async_session_maker
from app.models import Task
from sqlalchemy import select, desc

async def check_redis_queue():
    print(f"Checking Redis queue: {settings.TASK_QUEUE_KEY}")
    r = get_redis()
    try:
        length = await r.llen(settings.TASK_QUEUE_KEY)
        print(f"Queue length: {length}")
        if length > 0:
            items = await r.lrange(settings.TASK_QUEUE_KEY, 0, 4)
            print(f"First 5 items: {items}")
    except Exception as e:
        print(f"Error checking Redis: {e}")

async def check_latest_tasks():
    print("\nChecking latest tasks in database:")
    async with async_session_maker() as db:
        result = await db.execute(select(Task).order_by(desc(Task.created_at)).limit(5))
        tasks = result.scalars().all()
        for task in tasks:
            print(f"Task ID: {task.id}, Type: {task.type}, Status: {task.status}, Created At: {task.created_at}")

async def main():
    await check_redis_queue()
    await check_latest_tasks()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
