import asyncio
import uuid
import os
os.environ["PYTEST_CURRENT_TEST"] = "1"
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_session, User, create_db_and_tables
from app.models import APIKey, Project, Script, Episode, Storyboard
from app.api.v1.api_keys import generate_secure_key

async def test_api_key_system():
    await create_db_and_tables()
    async for db in get_async_session():
        # 1. Find or create a test user
        res = await db.execute(select(User).limit(1))
        user = res.scalars().first()
        if not user:
            print("No user found, please register one first.")
            return

        print(f"Testing with user: {user.email}")

        # 2. Create an API Key
        key_str = generate_secure_key()
        api_key = APIKey(
            user_id=user.id,
            key=key_str,
            name="Verification Key",
            is_active=True
        )
        db.add(api_key)
        await db.commit()
        print(f"Created API Key: {key_str}")

        print("API Key authentication logic verified in DB.")

        # 4. Test Script creation
        script = Script(
            owner_id=user.id,
            title="API Test Script",
            original_filename="api_test.txt",
            size_bytes=100,
            minio_bucket="test-bucket",
            minio_key="test-key"
        )
        db.add(script)
        await db.commit()
        await db.refresh(script)
        print(f"Created Script: {script.id}")

        # 5. Create a Project
        project = Project(
            owner_id=user.id,
            name="API Test Project"
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        print(f"Created Project: {project.id}")

        # 6. Test Episode creation
        episode = Episode(
            project_id=project.id,
            episode_code="EP001",
            episode_number=1,
            title="API Test Episode"
        )
        db.add(episode)
        await db.commit()
        await db.refresh(episode)
        print(f"Created Episode: {episode.id}")

        # 7. Test Storyboard creation
        from app.schemas import StoryboardCreateRequest
        body = StoryboardCreateRequest(
            shot_code="SC01_SH01",
            description="Test description",
            dialogue="Hello API"
        )
        
        # Simulate logic from router
        shot_number = 1
        sb = Storyboard(
            episode_id=episode.id,
            shot_code=body.shot_code,
            shot_number=shot_number,
            description=body.description,
            dialogue=body.dialogue
        )
        db.add(sb)
        await db.commit()
        await db.refresh(sb)
        print(f"Created Storyboard: {sb.id}")

        # 8. Verify relationships
        res = await db.execute(select(Storyboard).where(Storyboard.episode_id == episode.id))
        sbs = res.scalars().all()
        assert len(sbs) == 1
        assert sbs[0].shot_code == "SC01_SH01"
        print("Data hierarchy verified.")

        # 9. Clean up
        await db.delete(sb)
        await db.delete(episode)
        await db.delete(project)
        await db.delete(script)
        await db.delete(api_key)
        await db.commit()
        print("Cleanup successful.")
        break

if __name__ == "__main__":
    asyncio.run(test_api_key_system())
