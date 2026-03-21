"""
AI 积分预估 API

提供 AI 调用前的积分消耗预估服务
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.users import current_active_user
from app.database import User
from app.schemas_response import ResponseBase
from app.schemas_ai_cost import CostEstimateRequest, CostEstimateResponse
from app.services.credit_price_service import credit_price_service
from app.services.credit_service import credit_service

router = APIRouter()


@router.post("/cost-estimate", response_model=ResponseBase[CostEstimateResponse])
async def estimate_cost(
    body: CostEstimateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
) -> ResponseBase[CostEstimateResponse]:
    """
    预估 AI 调用所需积分
    
    根据模型类别、配置ID等参数，返回预估积分消耗和当前余额
    """
    try:
        # 获取预估消耗
        if body.model_config_id:
            try:
                model_config_id = UUID(body.model_config_id)
                estimated_cost = await credit_price_service.get_cost_by_model_config_id(
                    db=db,
                    config_id=model_config_id,
                )
            except ValueError:
                # 无效的 UUID，使用类别默认定价
                estimated_cost = credit_price_service.get_cost_by_category(body.category)
        else:
            # 使用类别默认定价
            estimated_cost = credit_price_service.get_cost_by_category(body.category)
        
        # 获取用户当前余额
        try:
            balance = await credit_service.get_balance(db=db, user_id=user.id)
        except Exception:
            # 如果获取余额失败，假设余额充足
            balance = 999999
        
        return ResponseBase(
            code=200,
            msg="OK",
            data=CostEstimateResponse(
                estimated_cost=estimated_cost,
                currency="credits",
                user_balance=balance,
                sufficient=balance >= estimated_cost,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        # 发生错误时返回默认定价
        default_cost = credit_price_service.get_cost_by_category(body.category)
        return ResponseBase(
            code=200,
            msg=f"预估失败，返回默认价格: {str(e)}",
            data=CostEstimateResponse(
                estimated_cost=default_cost,
                currency="credits",
                user_balance=0,
                sufficient=False,
            ),
        )
