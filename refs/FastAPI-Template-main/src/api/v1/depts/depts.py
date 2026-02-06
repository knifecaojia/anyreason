import json

from fastapi import APIRouter, Query

from repositories.dept import dept_repository
from schemas import Success
from schemas.depts import DeptCreate, DeptUpdate
from schemas.response import DeptDetailResponse, DeptListResponse, ResponseBase

router = APIRouter()


@router.get("/list", summary="查看部门列表", response_model=DeptListResponse)
async def list_dept(
    name: str = Query(None, description="部门名称"),
):
    dept_tree = await dept_repository.get_dept_tree(name)
    result = Success(data=dept_tree)
    return json.loads(result.body)


@router.get("/get", summary="查看部门", response_model=DeptDetailResponse)
async def get_dept(
    id: int = Query(..., description="部门ID"),
):
    dept_obj = await dept_repository.get(id=id)
    data = await dept_obj.to_dict()
    result = Success(data=data)
    return json.loads(result.body)


@router.post("/create", summary="创建部门", response_model=ResponseBase[None])
async def create_dept(
    dept_in: DeptCreate,
):
    await dept_repository.create_dept(obj_in=dept_in)
    result = Success(msg="Created Successfully")
    return json.loads(result.body)


@router.post("/update", summary="更新部门", response_model=ResponseBase[None])
async def update_dept(
    dept_in: DeptUpdate,
):
    await dept_repository.update_dept(obj_in=dept_in)
    result = Success(msg="Update Successfully")
    return json.loads(result.body)


@router.delete("/delete", summary="删除部门", response_model=ResponseBase[None])
async def delete_dept(
    dept_id: int = Query(..., description="部门ID"),
):
    await dept_repository.delete_dept(dept_id=dept_id)
    result = Success(msg="Deleted Success")
    return json.loads(result.body)
