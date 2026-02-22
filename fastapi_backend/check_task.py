import asyncio
import sys
from uuid import UUID
from app.database import async_session_maker
from app.models import Task
from sqlalchemy import select

async def main(task_id_str):
    async with async_session_maker() as session:
        try:
            task_uuid = UUID(task_id_str)
        except ValueError:
            print(f"Invalid UUID: {task_id_str}")
            return

        result = await session.execute(select(Task).where(Task.id == task_uuid))
        task = result.scalars().first()
        if task:
            print(f"Task ID: {task.id}")
            print(f"Status: {task.status}")
            print(f"Type: {task.type}")
            print(f"Created: {task.created_at}")
            print(f"Started: {task.started_at}")
            print(f"Finished: {task.finished_at}")
            print(f"Error: {task.error}")
        else:
            print("Task not found")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(main(sys.argv[1]))
    else:
        print("Usage: python check_task.py <task_id>")
