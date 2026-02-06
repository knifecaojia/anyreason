import json
import logging

from fastapi import APIRouter, Query

from repositories.menu import menu_repository
from schemas.base import Fail, Success, SuccessExtra
from schemas.menus import *
from schemas.response import (
    MenuDetailResponse,
    MenuListResponse,
    ResponseBase,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/list", summary="查看菜单列表", response_model=MenuListResponse)
async def list_menu(
    page: int = Query(1, description="页码"),
    page_size: int = Query(10, description="每页数量"),
):
    async def get_menu_with_children(menu_id: int):
        menu = await menu_repository.model.get(id=menu_id)
        menu_dict = await menu.to_dict()
        child_menus = await menu_repository.model.filter(parent_id=menu_id).order_by(
            "order"
        )
        menu_dict["children"] = [
            await get_menu_with_children(child.id) for child in child_menus
        ]
        return menu_dict

    parent_menus = await menu_repository.model.filter(parent_id=0).order_by("order")
    res_menu = [await get_menu_with_children(menu.id) for menu in parent_menus]
    result = SuccessExtra(
        data=res_menu, total=len(res_menu), page=page, page_size=page_size
    )
    return json.loads(result.body)


@router.get("/get", summary="查看菜单", response_model=MenuDetailResponse)
async def get_menu(
    menu_id: int = Query(..., description="菜单id"),
):
    result_data = await menu_repository.get(id=menu_id)
    result = Success(data=result_data)
    return json.loads(result.body)


@router.post("/create", summary="创建菜单", response_model=ResponseBase[None])
async def create_menu(
    menu_in: MenuCreate,
):
    await menu_repository.create(obj_in=menu_in)
    result = Success(msg="Created Success")
    return json.loads(result.body)


@router.post("/update", summary="更新菜单", response_model=ResponseBase[None])
async def update_menu(
    menu_in: MenuUpdate,
):
    await menu_repository.update(id=menu_in.id, obj_in=menu_in)
    result = Success(msg="Updated Success")
    return json.loads(result.body)


@router.delete("/delete", summary="删除菜单", response_model=ResponseBase[None])
async def delete_menu(
    id: int = Query(..., description="菜单id"),
):
    child_menu_count = await menu_repository.model.filter(parent_id=id).count()
    if child_menu_count > 0:
        result = Fail(msg="Cannot delete a menu with child menus")
        return json.loads(result.body)
    await menu_repository.remove(id=id)
    result = Success(msg="Deleted Success")
    return json.loads(result.body)
