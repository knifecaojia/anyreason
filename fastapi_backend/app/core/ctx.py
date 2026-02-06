from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Dict, Optional


request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_ctx: ContextVar[Dict[str, Any]] = ContextVar("user_ctx", default={})


def set_request_id(request_id: str) -> None:
    request_id_ctx.set(request_id)


def get_request_id() -> Optional[str]:
    return request_id_ctx.get()


def set_user_context(value: Dict[str, Any]) -> None:
    user_ctx.set(value)


def get_user_context() -> Dict[str, Any]:
    return user_ctx.get()

