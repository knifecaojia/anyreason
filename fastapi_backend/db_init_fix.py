#!/usr/bin/env python3
"""Initialize database and create admin user"""
import asyncio
import os
import sys

# Add app to path
sys.path.insert(0, '/app')

os.environ['PYTHONPATH'] = '/app'

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.core.config import settings

# Import models to register them
from app.models.user import User
from app.models.api_key import APIKey
from app.models.llm_preset import LLMPreset

DATABASE_URL = settings.DATABASE_URL

async def init_db():
    print(f"Connecting to database: {DATABASE_URL}")
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    print("Tables created successfully!")
    
    # Create admin user
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        from app.core.security import get_password_hash
        from sqlalchemy import select
        
        # Check if admin user exists
        result = await session.execute(
            select(User).where(User.email == "admin@znxview.com")
        )
        admin = result.scalar_one_or_none()
        
        if admin:
            print(f"Admin user already exists: {admin.email}")
        else:
            print("Creating admin user...")
            admin = User(
                email="admin@znxview.com",
                hashed_password=get_password_hash("IydQ0tGJfDbw"),
                is_active=True,
                is_superuser=True,
                is_verified=True
            )
            session.add(admin)
            await session.commit()
            print(f"Admin user created: {admin.email}")
    
    await engine.dispose()
    print("Database initialization complete!")

if __name__ == "__main__":
    asyncio.run(init_db())
