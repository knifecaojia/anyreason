import json

from fastapi import APIRouter, File, UploadFile

from core.dependency import DependAuth
from models.admin import User
from schemas.response import ResponseBase
from services.file_service import file_service

router = APIRouter()


@router.post(
    "/upload",
    summary="上传文件",
    response_model=ResponseBase[dict],
)
async def upload_file(
    file: UploadFile = File(..., description="要上传的文件"),
    current_user: User = DependAuth,
):
    """
    通用文件上传

    Args:
        file: 上传的文件

    Returns:
        上传成功的响应，包含文件信息
    """
    result = await file_service.upload_file(file, current_user.id)
    return json.loads(result.body)
