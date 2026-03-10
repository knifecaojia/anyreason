import asyncio
import os
import sys

sys.path.insert(0, "/app")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres:5432/anyreason")

from app.database import async_session_maker
from app.models import User
from fastapi_users.password import PasswordHelper
from sqlalchemy import select


async def fix_admin_password():
    email = "admin@example.com"
    password = "1235anyreason1235"
    
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if user is None:
            print(f"User {email} not found!")
            return
        
        user.hashed_password = PasswordHelper().hash(password)
        await session.commit()
        print(f"Password updated for {email}")


if __name__ == "__main__":
    asyncio.run(fix_admin_password())
