from httpx import AsyncClient, ASGITransport
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import make_url
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.password import PasswordHelper
import uuid
import asyncpg

from app.config import settings
from app.models import User, Base

from app.database import get_user_db, get_async_session
from app.users import get_jwt_strategy
from app.services.credit_service import credit_service


TEST_ENUM_DDL = [
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_status_enum') THEN
            CREATE TYPE canvas_status_enum AS ENUM ('draft', 'active', 'archived');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_node_status_enum') THEN
            CREATE TYPE canvas_node_status_enum AS ENUM ('pending', 'running', 'completed', 'failed');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_execution_status_enum') THEN
            CREATE TYPE canvas_execution_status_enum AS ENUM ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvas_trigger_type_enum') THEN
            CREATE TYPE canvas_trigger_type_enum AS ENUM ('manual', 'batch', 'auto');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_video_job_status_enum') THEN
            CREATE TYPE batch_video_job_status_enum AS ENUM ('draft', 'processing', 'completed', 'archived');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_video_asset_status_enum') THEN
            CREATE TYPE batch_video_asset_status_enum AS ENUM ('pending', 'generating', 'completed', 'failed');
        END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_video_history_status_enum') THEN
            CREATE TYPE batch_video_history_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
        END IF;
    END
    $$;
    """,
]


TEST_ENUM_DROP_DDL = [
    "DROP TYPE IF EXISTS canvas_trigger_type_enum",
    "DROP TYPE IF EXISTS canvas_execution_status_enum",
    "DROP TYPE IF EXISTS canvas_node_status_enum",
    "DROP TYPE IF EXISTS canvas_status_enum",
    "DROP TYPE IF EXISTS batch_video_history_status_enum",
    "DROP TYPE IF EXISTS batch_video_asset_status_enum",
    "DROP TYPE IF EXISTS batch_video_job_status_enum",
]


class _FakeObject:
    def __init__(self, payload: bytes):
        self._payload = payload

    def stream(self, _chunk_size: int):
        yield self._payload

    def read(self):
        return self._payload

    def close(self):
        return None

    def release_conn(self):
        return None


class _FakeMinio:
    def __init__(self):
        self._buckets: set[str] = set()
        self._objects: dict[tuple[str, str], bytes] = {}

    def bucket_exists(self, bucket: str) -> bool:
        return bucket in self._buckets

    def make_bucket(self, bucket: str):
        self._buckets.add(bucket)

    def put_object(self, *, bucket_name: str, object_name: str, data, length: int, content_type: str):
        _ = content_type
        self._buckets.add(bucket_name)
        self._objects[(bucket_name, object_name)] = data.read(length)

    def get_object(self, bucket: str | None = None, key: str | None = None, *, bucket_name: str | None = None, object_name: str | None = None):
        b = bucket_name or bucket
        k = object_name or key
        return _FakeObject(self._objects[(b, k)])

    def remove_object(self, *, bucket_name: str, object_name: str):
        self._objects.pop((bucket_name, object_name), None)


@pytest.fixture(autouse=True)
def mock_minio(monkeypatch):
    fake = _FakeMinio()
    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)
    return fake


@pytest_asyncio.fixture(scope="function")
async def engine():
    """Create a fresh test database engine for each test function."""
    test_url = make_url(settings.TEST_DATABASE_URL)
    admin_url = test_url.set(database="postgres")
    admin_dsn = admin_url.render_as_string(hide_password=False).replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    conn = await asyncpg.connect(admin_dsn)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", test_url.database
        )
        if not exists:
            await conn.execute(f'CREATE DATABASE "{test_url.database}"')
    finally:
        await conn.close()

    engine = create_async_engine(settings.TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        for ddl in TEST_ENUM_DDL:
            await conn.exec_driver_sql(ddl)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        for ddl in TEST_ENUM_DROP_DDL:
            await conn.exec_driver_sql(ddl)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(engine):
    """Create a fresh database session for each test."""
    async_session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as session:
        yield session
        await session.rollback()
        await session.close()


@pytest_asyncio.fixture(scope="function")
async def test_client(db_session):
    """Fixture to create a test client that uses the test database session."""
    # Lazy import to avoid triggering heavy optional dependencies for config-only tests
    from app.main import app  # noqa: E402

    # FastAPI-Users database override (wraps session with user operation helpers)
    async def override_get_user_db():
        session = SQLAlchemyUserDatabase(db_session, User)
        try:
            yield session
        finally:
            await db_session.close()

    # General database override (raw session access)
    async def override_get_async_session():
        try:
            yield db_session
        finally:
            await db_session.close()

    # Set up test database overrides
    app.dependency_overrides[get_user_db] = override_get_user_db
    app.dependency_overrides[get_async_session] = override_get_async_session

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://localhost:8000"
    ) as client:
        yield client


@pytest_asyncio.fixture(scope="function")
async def authenticated_user(test_client, db_session):
    """Fixture to create and authenticate a test user directly in the database."""

    # Create user data
    user_data = {
        "id": uuid.uuid4(),
        "email": "test@example.com",
        "hashed_password": PasswordHelper().hash("TestPassword123#"),
        "is_active": True,
        "is_superuser": False,
        "is_verified": True,
    }

    # Create user directly in database
    user = User(**user_data)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    await credit_service.ensure_account(
        db=db_session,
        user_id=user.id,
        initial_balance=settings.DEFAULT_INITIAL_CREDITS,
        reason="init",
    )
    await db_session.commit()

    # Generate token using the strategy directly
    strategy = get_jwt_strategy()
    access_token = await strategy.write_token(user)

    # Return both the headers and the user data
    return {
        "headers": {"Authorization": f"Bearer {access_token}"},
        "user": user,
        "user_data": {"email": user_data["email"], "password": "TestPassword123#"},
    }


@pytest_asyncio.fixture(scope="function")
async def authenticated_superuser(test_client, db_session):
    user_data = {
        "id": uuid.uuid4(),
        "email": "admin@example.com",
        "hashed_password": PasswordHelper().hash("AdminPassword123#"),
        "is_active": True,
        "is_superuser": True,
        "is_verified": True,
    }

    user = User(**user_data)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await credit_service.ensure_account(
        db=db_session,
        user_id=user.id,
        initial_balance=settings.DEFAULT_INITIAL_CREDITS,
        reason="init",
    )
    await db_session.commit()

    strategy = get_jwt_strategy()
    access_token = await strategy.write_token(user)

    return {
        "headers": {"Authorization": f"Bearer {access_token}"},
        "user": user,
        "user_data": {"email": user_data["email"], "password": "AdminPassword123#"},
    }
