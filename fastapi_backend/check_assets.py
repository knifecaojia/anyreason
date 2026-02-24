import asyncio
from sqlalchemy import select, desc
from app.database import async_session_maker
from app.models import Task, Asset
from app.config import settings

PROJECT_ID = "97887711-6070-4b65-87b7-62c05c8645c6"

async def check_assets_and_tasks():
    async with async_session_maker() as db:
        print(f"Checking tasks for project: {PROJECT_ID}")
        
        # 1. 查找最近的 apply_plan_execute 任务 (通常是落库任务)
        query = select(Task).where(
            Task.type == "apply_plan_execute"
        ).order_by(desc(Task.created_at)).limit(5)
        
        result = await db.execute(query)
        tasks = result.scalars().all()
        
        print(f"Found {len(tasks)} recent apply_plan_execute tasks:")
        for t in tasks:
            print(f"ID: {t.id} | Status: {t.status} | Created: {t.created_at}")
            print(f"Input: {t.input_json}")
            if t.result_json:
                print(f"Result: {t.result_json}")
            print("-" * 20)

        # 2. 查找该项目下的资产
        print(f"\nChecking assets for project: {PROJECT_ID}")
        query_assets = select(Asset).where(Asset.project_id == PROJECT_ID).order_by(desc(Asset.created_at)).limit(10)
        result_assets = await db.execute(query_assets)
        assets = result_assets.scalars().all()
        
        if not assets:
            print("No assets found for this project.")
        else:
            print(f"Found {len(assets)} recent assets:")
            for a in assets:
                print(f"ID: {a.id} | Name: {a.name} | Type: {a.type} | Created: {a.created_at}")

if __name__ == "__main__":
    asyncio.run(check_assets_and_tasks())
