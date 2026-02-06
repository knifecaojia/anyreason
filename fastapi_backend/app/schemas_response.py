from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel


T = TypeVar("T")


class ResponseBase(BaseModel, Generic[T]):
    code: int = 200
    msg: str = "OK"
    data: T | None = None

