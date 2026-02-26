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


def _is_db_connection_error(exc: Exception) -> bool:
    """Detect database connectivity errors (connection refused, timeout, pool exhausted, etc.)."""
    db_indicators = (
        "ConnectionRefusedError",
        "OperationalError",
        "InterfaceError",
        "TimeoutError",
        "connection is closed",
        "connection was closed",
        "could not connect",
        "Connection refused",
        "remaining connection slots",
        "too many clients",
        "server closed the connection unexpectedly",
    )
    exc_chain: list[BaseException] = []
    cur: BaseException | None = exc
    while cur and len(exc_chain) < 10:
        exc_chain.append(cur)
        cur = cur.__cause__ or cur.__context__
    for e in exc_chain:
        type_name = type(e).__name__
        msg = str(e)
        for indicator in db_indicators:
            if indicator in type_name or indicator in msg:
                return True
    return False


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = get_request_id()
    logger.bind(
        context={
            "request_id": request_id,
            "method": request.method,
            "path": str(request.url.path),
        }
    ).exception("unhandled_exception")

    if _is_db_connection_error(exc):
        payload = {
            "code": 503,
            "msg": "Service temporarily unavailable: database connection failed",
            "data": None,
            "request_id": request_id,
        }
        return JSONResponse(status_code=503, content=payload)

    payload = {
        "code": 500,
        "msg": "Internal Server Error",
        "data": None,
        "request_id": request_id,
    }
    return JSONResponse(status_code=500, content=payload)

