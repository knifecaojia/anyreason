import asyncio
import logging

from dotenv import load_dotenv

from app.database import (
    create_db_and_tables,
    ensure_default_admin,
    ensure_builtin_roles,
    ensure_builtin_permissions,
    ensure_builtin_agent_platform_assets,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Initializing database...")
    await create_db_and_tables()
    await ensure_builtin_roles()
    await ensure_builtin_permissions()
    await ensure_default_admin()
    await ensure_builtin_agent_platform_assets()
    logger.info("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(main())
