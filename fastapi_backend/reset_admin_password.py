import asyncio
import logging
import sys
import os

# Ensure /app is in python path
sys.path.append("/app")

from dotenv import load_dotenv
from sqlalchemy import select
from app.database import async_session_maker
from app.models import User
from fastapi_users.password import PasswordHelper

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

async def main():
    email = "admin@example.com"
    new_password = "admin123"
    
    logger.info(f"Attempting to reset password for {email}...")
    
    async with async_session_maker() as session:
        # Check if user exists
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if user is None:
            logger.error(f"User {email} not found in database!")
            return

        logger.info(f"User found (ID: {user.id}). Updating password...")
        
        # Hash new password
        hashed_password = PasswordHelper().hash(new_password)
        user.hashed_password = hashed_password
        
        session.add(user)
        await session.commit()
        
        logger.info(f"Password for {email} has been reset to '{new_password}'")

if __name__ == "__main__":
    asyncio.run(main())
