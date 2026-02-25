#!/usr/bin/env python3
"""Minimal database initialization using SQLAlchemy directly"""
import asyncio
import os
import sys

sys.path.insert(0, '/app')
os.environ['PYTHONPATH'] = '/app'
os.chdir('/app')

# Change to /app and add to path
os.chdir('/app')

async def init_db():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker, declarative_base
    from sqlalchemy import Column, Integer, String, Boolean, select, DateTime, func
    from sqlalchemy.sql import expression
    from passlib.context import CryptContext

    # Password hashing
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    DATABASE_URL = "postgresql+asyncpg://anyreason_app:8KwGsOZfQAILMVCyDJrB5@postgres:5432/anyreason"

    # Create engine
    engine = create_async_engine(DATABASE_URL, echo=False)

    # Define base
    Base = declarative_base()

    # Define User model
    class User(Base):
        __tablename__ = "user"

        id = Column(Integer, primary_key=True, index=True)
        email = Column(String(320), unique=True, index=True, nullable=False)
        hashed_password = Column(String(1024), nullable=False)
        is_active = Column(Boolean, default=True, nullable=False)
        is_superuser = Column(Boolean, default=False, nullable=False)
        is_verified = Column(Boolean, default=False, nullable=False)
        created_at = Column(DateTime(timezone=True), server_default=func.now())
        updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully!")

    # Create admin user
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        # Check if admin exists
        result = await session.execute(
            select(User).where(User.email == "admin@znxview.com")
        )
        admin = result.scalar_one_or_none()

        if admin:
            print(f"Admin user already exists: {admin.email}")
        else:
            print("Creating admin user...")
            hashed_password = pwd_context.hash("IydQ0tGJfDbw")
            admin = User(
                email="admin@znxview.com",
                hashed_password=hashed_password,
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
