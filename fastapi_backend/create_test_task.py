import asyncio
from app.database import async_session_maker
from app.services.task_service import task_service
from app.schemas import TaskCreateRequest
from uuid import uuid4
from app.models import User
from sqlalchemy import select

async def main():
    async with async_session_maker() as session:
        user = (await session.execute(select(User))).scalars().first()
        if not user:
            print("No user found")
            return
        
        print(f"Creating task for user {user.id}")
        try:
            task = await task_service.create_task(
                db=session,
                user_id=user.id,
                payload=TaskCreateRequest(
                    type="noop",
                    input_json={"message": "Health check"},
                    entity_type="system",
                    entity_id=uuid4()
                )
            )
            print(f"Task created: {task.id}")
            
            # Monitor it
            for _ in range(10):
                await asyncio.sleep(1)
                await session.refresh(task)
                print(f"Status: {task.status}, Progress: {task.progress}")
                if task.status in ["succeeded", "failed"]:
                    break
        except Exception as e:
            print(f"Error creating/monitoring task: {e}")

if __name__ == "__main__":
    asyncio.run(main())
