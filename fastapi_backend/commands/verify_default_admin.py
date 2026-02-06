import asyncio

from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import settings
from app.database import async_session_maker, create_db_and_tables, ensure_default_admin
from app.main import app
from app.models import User


load_dotenv()


async def main() -> None:
    await create_db_and_tables()
    await ensure_default_admin()

    async with async_session_maker() as session:
        user = (
            await session.execute(
                select(User).where(User.email == settings.DEFAULT_ADMIN_EMAIL)
            )
        ).scalar_one_or_none()
        if user is None:
            raise RuntimeError("default admin user not found")
        if not user.is_superuser:
            raise RuntimeError("default admin user is not superuser")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post(
            "/auth/jwt/login",
            data={
                "username": settings.DEFAULT_ADMIN_EMAIL,
                "password": settings.DEFAULT_ADMIN_PASSWORD,
            },
        )
        if resp.status_code != 200:
            raise RuntimeError(f"login failed: {resp.status_code} {resp.text}")

        data = resp.json()
        if not data.get("access_token"):
            raise RuntimeError("login response missing access_token")

    print("OK")


if __name__ == "__main__":
    asyncio.run(main())
