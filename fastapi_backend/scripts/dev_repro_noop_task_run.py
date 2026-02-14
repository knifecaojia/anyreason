import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.database import User, async_session_maker
from app.repositories import task_repository
from app.tasks.process_task import process_task


async def main() -> None:
    async with async_session_maker() as db:
        user_id = (await db.execute(select(User.id))).scalars().first()
        if not user_id:
            raise RuntimeError("no_user")
        task = await task_repository.create_task(
            db=db,
            user_id=user_id,
            task_data={"type": "noop", "input_json": {}},
        )
        await task_repository.create_task_event(db=db, task_id=task.id, event_type="created", payload={"status": task.status})
        tid = task.id

    await process_task(task_id=tid)

    async with async_session_maker() as db:
        row = await task_repository.get_user_task(db=db, user_id=user_id, task_id=tid)
        print({"id": str(tid), "status": getattr(row, "status", None), "progress": getattr(row, "progress", None)})


if __name__ == "__main__":
    asyncio.run(main())

