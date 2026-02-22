import asyncio
import sys
from uuid import UUID
from app.database import async_session_maker
from app.models import Task
from sqlalchemy import select, desc

async def main():
    async with async_session_maker() as session:
        result = await session.execute(select(Task).order_by(desc(Task.created_at)).limit(5))
        tasks = result.scalars().all()
        print(f"Found {len(tasks)} tasks:")
        for task in tasks:
            print(f"--- Task {task.id} ---")
            print(f"Status: {task.status}")
            print(f"Type: {task.type}")
            print(f"Created: {task.created_at}")
            print(f"Error: {task.error}")

if __name__ == "__main__":
    asyncio.run(main())
