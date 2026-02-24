
import asyncio
from uuid import UUID
from app.database import async_session_maker
from app.repositories import asset_repository

async def main():
    async with async_session_maker() as db:
        project_id = UUID('97887711-6070-4b65-87b7-62c05c8645c6')
        assets = await asset_repository.list_assets(db, project_id=project_id)
        print(f"Total Assets for project {project_id}: {len(assets)}")
        found = False
        for a in assets:
            if a.name == '叶辰':
                print(f"Found 叶辰: ID={a.id}, Source={a.source}, Type={a.type}, Status={a.lifecycle_status}")
                found = True
        if not found:
            print("叶辰 NOT found in list_assets result")

if __name__ == "__main__":
    asyncio.run(main())
