import pytest
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine
from fastapi_users.db import SQLAlchemyUserDatabase
import subprocess
import os

from app.database import (
    async_session_maker,
    create_db_and_tables,
    get_async_session,
    get_user_db,
)
from app.models import Base, User


@pytest.fixture
async def mock_engine(mocker):
    # Mock the engine
    mock_engine = mocker.AsyncMock(spec=AsyncEngine)

    # Create a mock connection
    mock_conn = mocker.AsyncMock()
    mock_conn.run_sync = mocker.AsyncMock()

    # Set up the context manager properly
    mock_context = mocker.AsyncMock()
    mock_context.__aenter__.return_value = mock_conn
    mock_engine.begin.return_value = mock_context

    return mock_engine


@pytest.fixture
async def mock_session(mocker):
    # Create a mock session
    mock_session = mocker.AsyncMock(spec=AsyncSession)

    # Mock the session context manager
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = None

    # Mock the session maker
    mock_session_maker = mocker.patch("app.database.async_session_maker")
    mock_session_maker.return_value = mock_session

    return mock_session


@pytest.mark.asyncio
async def test_create_db_and_tables(mock_engine, mocker):
    # Replace the real engine with our mock
    mocker.patch("app.database.engine", mock_engine)

    await create_db_and_tables()

    # Verify that begin was called
    mock_engine.begin.assert_called_once()

    # Verify that create_all was called
    mock_conn = mock_engine.begin.return_value.__aenter__.return_value
    mock_conn.run_sync.assert_called_once_with(Base.metadata.create_all)


@pytest.mark.asyncio
async def test_get_async_session(mock_session):
    # Test the session generator
    session_generator = get_async_session()
    session = await session_generator.__anext__()

    # Verify we got the mock session
    assert session == mock_session

    # Verify the session was created with the expected context
    mock_session.__aenter__.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_db(mock_session):
    # Test the user db generator
    user_db_generator = get_user_db(mock_session)
    user_db = await user_db_generator.__anext__()

    # Verify we got a SQLAlchemyUserDatabase instance
    assert isinstance(user_db, SQLAlchemyUserDatabase)
    assert user_db.session == mock_session
    # Verify the model class is correct
    assert user_db.user_table == User


def test_engine_creation(mocker):
    # Mock settings
    mock_settings = mocker.patch("app.database.settings")
    mock_settings.DATABASE_URL = "sqlite+aiosqlite:///./test.db"
    mock_settings.EXPIRE_ON_COMMIT = False

    # Import engine to trigger creation with mocked settings
    from app.database import engine, async_session_maker

    # Verify engine is created
    assert isinstance(engine, AsyncEngine)

    # Verify session maker is configured
    assert async_session_maker.kw["expire_on_commit"] is False


@pytest.mark.asyncio
async def test_session_maker_configuration():
    # Create a test session
    async with async_session_maker() as session:
        assert isinstance(session, AsyncSession)


@pytest.mark.asyncio
async def test_create_db_and_tables_fails_for_unversioned_nonempty_db(mocker):
    mocker.patch("app.database._alembic_version_table_exists", mocker.AsyncMock(return_value=False))
    mocker.patch("app.database._has_public_user_tables", mocker.AsyncMock(return_value=True))
    run_upgrade = mocker.patch("app.database._run_alembic_upgrade", mocker.AsyncMock())
    getenv = mocker.patch("app.database.os.getenv", side_effect=lambda key, default=None: default if key == "PYTEST_CURRENT_TEST" else os.getenv(key, default))

    with pytest.raises(RuntimeError, match="alembic_version"):
        await create_db_and_tables()

    getenv.assert_any_call("PYTEST_CURRENT_TEST")
    run_upgrade.assert_not_called()
