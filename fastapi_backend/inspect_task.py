import asyncio
import sys
from uuid import UUID
from app.database import async_session_maker
from app.models import Task, TaskEvent
from sqlalchemy import select, desc, String, cast

async def main(partial_id):
    async with async_session_maker() as session:
        # Find task by partial ID
        stmt = select(Task).filter(cast(Task.id, String).like(f"{partial_id}%")).order_by(desc(Task.created_at))
        result = await session.execute(stmt)
        task = result.scalars().first()
        
        if not task:
            print(f"No task found starting with {partial_id}")
            return

        print(f"--- Task {task.id} ---")
        print(f"Status: {task.status}")
        print(f"Type: {task.type}")
        print(f"Created: {task.created_at}")
        print(f"Started: {task.started_at}")
        print(f"Finished: {task.finished_at}")
        print(f"Progress: {task.progress}")
        print(f"Error: {task.error}")
        print(f"Input: {task.input_json}")
        
        # Get events
        stmt_events = select(TaskEvent).where(TaskEvent.task_id == task.id).order_by(TaskEvent.created_at)
        events_res = await session.execute(stmt_events)
        events = events_res.scalars().all()
        
        print(f"\n--- Events ({len(events)}) ---")
        for evt in events:
            print(f"[{evt.created_at}] {evt.event_type}: {evt.payload}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(main(sys.argv[1]))
    else:
        print("Usage: python inspect_task.py <partial_task_id>")
