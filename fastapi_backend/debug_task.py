
import asyncio
import json
from app.database import async_session_maker
from app.models import Task
from sqlalchemy import select

async def main():
    async with async_session_maker() as db:
        # Find the latest task of type 'apply_plan_execute'
        stmt = select(Task).where(Task.type == 'apply_plan_execute').order_by(Task.created_at.desc()).limit(1)
        res = await db.execute(stmt)
        task = res.scalars().first()
        
        if task:
            print(f"Task ID: {task.id}")
            print(f"Status: {task.status}")
            print(f"Error: {task.error}")
            print("Input JSON:")
            print(json.dumps(task.input_json, indent=2, ensure_ascii=False))
            print("Result JSON:")
            print(json.dumps(task.result_json, indent=2, ensure_ascii=False))
        else:
            print("No apply_plan_execute tasks found.")

if __name__ == "__main__":
    asyncio.run(main())
