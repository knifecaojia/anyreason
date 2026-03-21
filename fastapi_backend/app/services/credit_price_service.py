"""
积分价格服务

提供AI模型积分价格查询和计算功能。
默认定价：
- text: 1 积分
- image: 5 积分
- video: 50 积分

每个模型可以通过 credits_cost 字段自定义价格，0表示使用默认定价。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models import AIModelConfig


class CreditPriceService:
    """积分价格服务"""

    # 默认定价规则
    DEFAULT_COSTS = {
        "text": 1,  # 文本模型默认1积分
        "image": 5,  # 图片模型默认5积分
        "video": 50,  # 视频模型默认50积分
    }

    def get_model_cost(self, model_config: AIModelConfig) -> int:
        """
        获取模型的积分价格

        优先使用模型自定义价格（credits_cost > 0），
        否则使用默认定价（根据category判断）

        Args:
            model_config: AI模型配置对象

        Returns:
            int: 该模型的积分价格
        """
        # 如果设置了自定义价格（>0），使用自定义价格
        if model_config.credits_cost and model_config.credits_cost > 0:
            return model_config.credits_cost

        # 否则使用默认定价
        return self.DEFAULT_COSTS.get(model_config.category, 1)

    def get_cost_by_category(self, category: str) -> int:
        """
        根据类别获取默认定价

        Args:
            category: 模型类别（text/image/video）

        Returns:
            int: 该类别的默认定价
        """
        return self.DEFAULT_COSTS.get(category, 1)

    async def get_cost_by_model_config_id(
        self,
        db: AsyncSession,
        config_id,
    ) -> int:
        """
        根据模型配置ID获取积分价格

        Args:
            db: 数据库会话
            config_id: 模型配置ID

        Returns:
            int: 该模型的积分价格

        Raises:
            ValueError: 如果模型配置不存在
        """
        from app.models import AIModelConfig

        result = await db.execute(
            select(AIModelConfig).where(AIModelConfig.id == config_id)
        )
        model_config = result.scalar_one_or_none()

        if model_config is None:
            raise ValueError(f"Model config not found: {config_id}")

        return self.get_model_cost(model_config)


# 全局服务实例
credit_price_service = CreditPriceService()
