from fastapi import APIRouter, Body, Query

from schemas.response import (
    ResponseBase,
    UserCreateResponse,
    UserDeleteResponse,
    UserDetailResponse,
    UserListResponse,
    UserUpdateResponse,
)
from schemas.users import UserCreate, UserUpdate
from services.user_service import user_service

router = APIRouter()


@router.get("/list", summary="查看用户列表", response_model=UserListResponse)
async def list_user(
    page: int = Query(1, description="页码"),
    page_size: int = Query(10, description="每页数量"),
    username: str = Query("", description="用户名称，用于搜索"),
    email: str = Query("", description="邮箱地址"),
    dept_id: int = Query(None, description="部门ID"),
):
    result = await user_service.get_user_list(
        page=page,
        page_size=page_size,
        username=username,
        email=email,
        dept_id=dept_id,
    )
    return result


@router.get("/get", summary="查看用户", response_model=UserDetailResponse)
async def get_user(
    user_id: int = Query(..., description="用户ID"),
):
    result = await user_service.get_user_detail(user_id)
    return result


@router.post("/create", summary="创建用户", response_model=UserCreateResponse)
async def create_user(
    user_in: UserCreate,
):
    result = await user_service.create_user(user_in)
    return result


@router.post("/update", summary="更新用户", response_model=UserUpdateResponse)
async def update_user(
    user_in: UserUpdate,
):
    result = await user_service.update_user(user_in)
    return result


@router.delete("/delete", summary="删除用户", response_model=UserDeleteResponse)
async def delete_user(
    user_id: int = Query(..., description="用户ID"),
):
    result = await user_service.delete_user(user_id)
    return result


@router.post("/reset_password", summary="重置密码", response_model=ResponseBase[None])
async def reset_password(user_id: int = Body(..., description="用户ID", embed=True)):
    result = await user_service.reset_user_password(user_id)
    return result
