"""
AI 积分预估相关 Schema
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CostEstimateRequest(BaseModel):
    """积分预估请求"""
    category: str = Field(..., description="模型类别: text/image/video")
    model_config_id: str | None = Field(None, description="模型配置ID（可选）")
    binding_key: str | None = Field(None, description="绑定键（可选）")
    params: dict | None = Field(None, description="额外参数（如视频时长、图片尺寸等）")


class CostEstimateResponse(BaseModel):
    """积分预估响应"""
    estimated_cost: int = Field(..., description="预估消耗积分")
    currency: str = Field(default="credits", description="货币单位")
    user_balance: int = Field(..., description="用户当前余额")
    sufficient: bool = Field(..., description="余额是否充足")
