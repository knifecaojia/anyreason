"""
数据库初始化脚本 (docker-deploy 版本)

执行流程：
  1. Alembic 迁移 (create_db_and_tables)
  2. 内置角色初始化 (admin / user)
  3. 内置权限初始化 + 权限分配给 admin 角色
  4. 默认管理员账户创建 (当 CREATE_DEFAULT_ADMIN=true)
  5. Agent 平台内置资产初始化
  6. AI 模型种子数据 (厂商 / 模型 / 配置 / 绑定)
"""

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
from seed_models import seed_models

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("========== 数据库初始化开始 ==========")

    logger.info("[1/6] 执行数据库迁移 (Alembic) ...")
    await create_db_and_tables()
    logger.info("[1/6] 数据库迁移完成")

    logger.info("[2/6] 初始化内置角色 (admin, user) ...")
    await ensure_builtin_roles()
    logger.info("[2/6] 内置角色初始化完成")

    logger.info("[3/6] 初始化内置权限并分配给 admin 角色 ...")
    await ensure_builtin_permissions()
    logger.info("[3/6] 内置权限初始化完成")

    logger.info("[4/6] 创建默认管理员账户 ...")
    await ensure_default_admin()
    logger.info("[4/6] 默认管理员账户处理完成")

    logger.info("[5/6] 初始化 Agent 平台内置资产 ...")
    await ensure_builtin_agent_platform_assets()
    logger.info("[5/6] Agent 平台内置资产初始化完成")

    logger.info("[6/6] 导入 AI 模型种子数据 (厂商/模型/配置/绑定) ...")
    await seed_models()
    logger.info("[6/6] AI 模型种子数据导入完成")

    logger.info("========== 数据库初始化完成 ==========")


if __name__ == "__main__":
    asyncio.run(main())
