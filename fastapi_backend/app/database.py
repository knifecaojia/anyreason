from typing import AsyncGenerator
from urllib.parse import urlparse

import asyncio
import logging
import os
import sys
import subprocess

from fastapi import Depends
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.password import PasswordHelper
from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base, Permission, Role, RolePermission, User, UserRole
from app.services.credit_service import credit_service


logger = logging.getLogger("app.database")


parsed_db_url = urlparse(settings.DATABASE_URL)

db_hostname = parsed_db_url.hostname
if db_hostname == "localhost":
    db_hostname = "127.0.0.1"

async_db_connection_url = (
    f"postgresql+asyncpg://{parsed_db_url.username}:{parsed_db_url.password}@"
    f"{db_hostname}{':' + str(parsed_db_url.port) if parsed_db_url.port else ''}"
    f"{parsed_db_url.path}"
)

# Disable connection pooling for serverless environments like Vercel
engine = create_async_engine(
    async_db_connection_url,
    poolclass=NullPool,
    connect_args={"timeout": 10},
)

async_session_maker = async_sessionmaker(
    engine, expire_on_commit=settings.EXPIRE_ON_COMMIT
)


async def _alembic_version_table_exists() -> bool:
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT to_regclass('public.alembic_version')"))
        return res.scalar_one_or_none() is not None


async def _has_public_user_tables() -> bool:
    async with engine.connect() as conn:
        res = await conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_tables
                    WHERE schemaname = 'public'
                      AND tablename <> 'alembic_version'
                )
                """
            )
        )
        return bool(res.scalar_one())


async def _run_alembic_upgrade(stamp_revision: str | None = None) -> None:
    from pathlib import Path

    if not os.getenv("DATABASE_URL"):
        os.environ["DATABASE_URL"] = settings.DATABASE_URL

    root_dir = Path(__file__).resolve().parents[1]
    alembic_ini = root_dir / "alembic.ini"

    def _run_cmd(args: list[str]) -> None:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "-c",
                str(alembic_ini),
                *args,
            ],
            cwd=str(root_dir),
            env=os.environ.copy(),
            check=True,
            timeout=55,
        )

    if stamp_revision:
        await asyncio.to_thread(_run_cmd, ["stamp", stamp_revision])
    await asyncio.to_thread(_run_cmd, ["upgrade", "head"])


async def create_db_and_tables() -> None:
    logger.info("db:init start")

    if os.getenv("PYTEST_CURRENT_TEST"):
        async def _run() -> None:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        await asyncio.wait_for(_run(), timeout=30)
        logger.info("db:init done")
        return

    async def _migrate() -> None:
        has_version = await _alembic_version_table_exists()
        has_tables = await _has_public_user_tables()
        if not has_version:
            if has_tables:
                await _run_alembic_upgrade(stamp_revision="d3f1a9c7b2e1")
                return
            await _run_alembic_upgrade()
            return

        if not has_tables:
            await _run_alembic_upgrade(stamp_revision="base")
            return

        await _run_alembic_upgrade()

    await asyncio.wait_for(_migrate(), timeout=60)
    logger.info("db:init done")


async def ensure_default_admin() -> None:
    if not settings.CREATE_DEFAULT_ADMIN:
        return

    if os.getenv("PYTEST_CURRENT_TEST"):
        return

    email = settings.DEFAULT_ADMIN_EMAIL
    password = settings.DEFAULT_ADMIN_PASSWORD
    if not email or not password:
        return

    logger.info("db:seed_admin start")

    async def _run() -> None:
        async with async_session_maker() as session:
            admin_role = (
                await session.execute(select(Role).where(Role.name == "admin"))
            ).scalar_one_or_none()
            existing = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if existing is not None:
                return

            user = User(
                email=email,
                hashed_password=PasswordHelper().hash(password),
                is_active=True,
                is_superuser=True,
                is_verified=True,
            )
            session.add(user)
            await session.flush()
            await credit_service.ensure_account(
                db=session,
                user_id=user.id,
                initial_balance=settings.DEFAULT_INITIAL_CREDITS,
                reason="init",
            )
            if admin_role is not None:
                session.add(UserRole(user_id=user.id, role_id=admin_role.id))
            await session.commit()

    await asyncio.wait_for(_run(), timeout=30)
    logger.info("db:seed_admin done")


async def ensure_builtin_roles() -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return

    async def _run() -> None:
        async with async_session_maker() as session:
            existing = (
                await session.execute(select(Role).where(Role.name.in_(["admin", "user"])))
            ).scalars().all()
            names = {r.name for r in existing}
            if "admin" not in names:
                session.add(Role(name="admin", description="管理员"))
            if "user" not in names:
                session.add(Role(name="user", description="普通用户"))
            await session.commit()

    logger.info("db:seed_roles start")
    await asyncio.wait_for(_run(), timeout=30)
    logger.info("db:seed_roles done")


async def ensure_builtin_permissions() -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return

    builtin = [
        ("system.users", "用户管理"),
        ("system.roles", "角色与权限"),
        ("system.audit", "审计日志"),
        ("system.credits", "积分管理"),
        ("system.agents", "Agent 管理"),
        ("system.ai_models", "AI 模型配置"),
        ("menu.dashboard", "工作台"),
        ("menu.scripts.list", "剧本清单"),
        ("menu.scripts.write", "剧本创作"),
        ("menu.extraction", "资产提取"),
        ("menu.assets.list", "资产清单"),
        ("menu.assets.create", "资产创作"),
        ("menu.storyboard", "内容创作"),
        ("menu.studio", "创作工坊"),
        ("menu.projects", "项目归档"),
        ("menu.settings.models", "模型引擎"),
        ("menu.settings.users", "用户管理"),
        ("menu.settings.roles", "角色管理"),
        ("menu.settings.permissions", "权限管理"),
        ("menu.settings.audit", "系统审计"),
        ("menu.settings.credits", "积分管理"),
        ("menu.settings.agents", "Agent 管理"),
    ]

    async def _run() -> None:
        async with async_session_maker() as session:
            rows = (
                await session.execute(select(Permission).where(Permission.code.in_([c for c, _ in builtin])))
            ).scalars().all()
            existing = {p.code: p for p in rows}
            for code, desc in builtin:
                if code in existing:
                    continue
                session.add(Permission(code=code, description=desc))

            await session.flush()

            admin_role = (
                await session.execute(select(Role).where(Role.name == "admin"))
            ).scalar_one_or_none()
            if admin_role is not None:
                perm_rows = (
                    await session.execute(select(Permission).where(Permission.code.in_([c for c, _ in builtin])))
                ).scalars().all()
                perm_ids = [p.id for p in perm_rows]
                rp_rows = (
                    await session.execute(
                        select(RolePermission).where(
                            RolePermission.role_id == admin_role.id,
                            RolePermission.permission_id.in_(perm_ids),
                        )
                    )
                ).scalars().all()
                existing_rp = {(rp.role_id, rp.permission_id) for rp in rp_rows}
                for pid in perm_ids:
                    key = (admin_role.id, pid)
                    if key in existing_rp:
                        continue
                    session.add(RolePermission(role_id=admin_role.id, permission_id=pid))

            await session.commit()

    logger.info("db:seed_permissions start")
    await asyncio.wait_for(_run(), timeout=30)
    logger.info("db:seed_permissions done")


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:
    yield SQLAlchemyUserDatabase(session, User)
