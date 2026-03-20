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


# Use DO blocks with IF NOT EXISTS for enum creation
# This is compatible with all PostgreSQL versions and handles concurrent creation
TEST_ENUM_DDL = [
    "DO $$ BEGIN CREATE TYPE canvas_status_enum AS ENUM ('draft', 'active', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE canvas_node_status_enum AS ENUM ('pending', 'running', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE canvas_execution_status_enum AS ENUM ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE canvas_trigger_type_enum AS ENUM ('manual', 'batch', 'auto'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE batch_video_job_status_enum AS ENUM ('draft', 'processing', 'completed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE batch_video_asset_status_enum AS ENUM ('pending', 'generating', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE batch_video_history_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
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
        if b is None or k is None:
            raise KeyError("bucket and key cannot be None")
        return _FakeObject(self._objects[(b, k)])

    def remove_object(self, *, bucket_name: str, object_name: str):
        self._objects.pop((bucket_name, object_name), None)


@pytest.fixture(autouse=True)
def mock_minio(monkeypatch):
    fake = _FakeMinio()
    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)
    return fake


async def _create_test_database(admin_dsn: str, db_name: str) -> None:
    """Create a test database with retry logic for PostgreSQL semantics."""
    import asyncio

    max_retries = 5
    retry_delay = 0.1

    conn = await asyncpg.connect(admin_dsn, database="postgres")
    try:
        for attempt in range(max_retries):
            try:
                await conn.execute(f'CREATE DATABASE "{db_name}"')
                break
            except asyncpg.exceptions.DuplicateDatabaseError:
                # Race condition: another process created it. Retry.
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    raise
    finally:
        await conn.close()


async def _drop_test_database(admin_dsn: str, db_name: str) -> None:
    """Drop a test database with retry logic for PostgreSQL semantics."""
    import asyncio

    max_retries = 5
    retry_delay = 0.1

    conn = await asyncpg.connect(admin_dsn, database="postgres")
    try:
        # Step 1: Terminate all connections to the target database
        while True:
            result = await conn.fetch(
                """
                SELECT pid FROM pg_stat_activity
                WHERE datname = $1 AND pid <> pg_backend_pid()
                """,
                db_name,
            )
            if not result:
                break
            for row in result:
                try:
                    await conn.execute(f"SELECT pg_terminate_backend({row['pid']})")
                except Exception:
                    pass
            await asyncio.sleep(retry_delay)

        # Step 2: Drop database with retry
        for attempt in range(max_retries):
            try:
                await conn.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
                break
            except Exception:
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    pass  # Best effort - DB may not exist
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="function")
async def engine():
    """Create a fresh unique test database for each test function.
    
    Uses a unique database name per test to ensure complete isolation.
    Database is dropped after the test completes.
    """
    test_db_url = settings.TEST_DATABASE_URL
    assert test_db_url is not None, "TEST_DATABASE_URL must be set"
    test_url = make_url(test_db_url)
    base_db_name = str(test_url.database)  # type: ignore

    # Generate unique database name for this test
    unique_suffix = str(uuid.uuid4()).replace("-", "")[:12]
    unique_db_name = f"{base_db_name}_{unique_suffix}"

    # Build admin DSN for postgres database
    admin_url = test_url.set(database="postgres")
    admin_dsn = admin_url.render_as_string(hide_password=False).replace(
        "postgresql+asyncpg://", "postgresql://"
    )

    # Build the actual test database URL with unique name
    unique_test_url = test_url.set(database=unique_db_name)
    unique_test_db_url = unique_test_url.render_as_string(hide_password=False)
    unique_test_dsn = unique_test_url.render_as_string(hide_password=False).replace(
        "postgresql+asyncpg://", "postgresql://"
    )

    # Create the unique database
    await _create_test_database(admin_dsn, unique_db_name)

    # Create enums using asyncpg directly
    enum_conn = await asyncpg.connect(unique_test_dsn)
    try:
        for ddl in TEST_ENUM_DDL:
            await enum_conn.execute(ddl)
    finally:
        await enum_conn.close()

    # Create SQLAlchemy engine with unique database
    test_engine = create_async_engine(unique_test_db_url, echo=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    await test_engine.dispose()

    # Drop the unique database
    await _drop_test_database(admin_dsn, unique_db_name)


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
