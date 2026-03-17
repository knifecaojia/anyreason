import asyncio
import sys
sys.path.append("/app")

from dotenv import load_dotenv
from sqlalchemy import select
from app.database import async_session_maker
from app.models import User
from fastapi_users.password import PasswordHelper

load_dotenv()

async def main():
    email = "admin@example.com"
    new_password = "1235anyreason1235"
    
    print(f"Resetting password for {email}...")
    
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if user is None:
            print(f"User {email} not found!")
            return

        print(f"User found (ID: {user.id}). Updating password...")
        
        hashed_password = PasswordHelper().hash(new_password)
        user.hashed_password = hashed_password
        
        session.add(user)
        await session.commit()
        
        print(f"Password reset successful!")

if __name__ == "__main__":
    asyncio.run(main())
