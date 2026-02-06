from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.ctx import get_request_id
from app.log import logger


@dataclass
class AppError(Exception):
    msg: str
    code: int = 400
    status_code: int = 400
    data: Optional[Any] = None


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    payload = {
        "code": exc.code,
        "msg": exc.msg,
        "data": exc.data,
        "request_id": get_request_id(),
    }
    return JSONResponse(status_code=exc.status_code, content=payload)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.bind(
        context={
            "request_id": get_request_id(),
            "method": request.method,
            "path": str(request.url.path),
        }
    ).exception("unhandled_exception")
    payload = {
        "code": 500,
        "msg": "Internal Server Error",
        "data": None,
        "request_id": get_request_id(),
    }
    return JSONResponse(status_code=500, content=payload)

