import asyncio

from app.database import create_db_and_tables
from app.database import ensure_builtin_permissions
from app.database import ensure_builtin_roles
from app.database import ensure_default_admin


async def main() -> None:
    await create_db_and_tables()
    await ensure_builtin_roles()
    await ensure_builtin_permissions()
    await ensure_default_admin()


if __name__ == "__main__":
    asyncio.run(main())

