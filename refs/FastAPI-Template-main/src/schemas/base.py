from typing import Any

from fastapi.responses import JSONResponse


class Success(JSONResponse):
    def __init__(
        self,
        code: int = 200,
        msg: str | None = "OK",
        data: Any | None = None,
        **kwargs,
    ):
        # 确保msg不为None
        if msg is None:
            msg = "OK"
        content = {"code": code, "msg": msg, "data": data}
        content.update(kwargs)
        super().__init__(content=content, status_code=code)


class Fail(JSONResponse):
    def __init__(
        self,
        code: int = 400,
        msg: str | None = None,
        data: Any | None = None,
        **kwargs,
    ):
        # 确保msg不为None
        if msg is None:
            msg = "Error"
        content = {"code": code, "msg": msg, "data": data}
        content.update(kwargs)
        super().__init__(content=content, status_code=code)


class SuccessExtra(JSONResponse):
    def __init__(
        self,
        code: int = 200,
        msg: str | None = None,
        data: Any | None = None,
        total: int = 0,
        page: int = 1,
        page_size: int = 20,
        **kwargs,
    ):
        # 确保msg不为None
        if msg is None:
            msg = "OK"
        content = {
            "code": code,
            "msg": msg,
            "data": data,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
        content.update(kwargs)
        super().__init__(content=content, status_code=code)
