from __future__ import annotations

from uuid import UUID

from starlette.requests import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def build_request_meta(request: Request) -> dict:
    client_ip = request.client.host if request.client else None
    return {
        "request_id": request.headers.get("X-Request-ID"),
        "ip": client_ip,
        "user_agent": request.headers.get("User-Agent"),
        "method": request.method,
        "path": str(request.url.path),
    }


async def write_audit_log(
    *,
    session: AsyncSession,
    request: Request,
    actor_user_id: UUID | None,
    action: str,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    success: bool = True,
    meta: dict | None = None,
) -> AuditLog:
    req_meta = build_request_meta(request)
    merged_meta = {**(meta or {}), **req_meta}

    row = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        success=success,
        request_id=req_meta.get("request_id"),
        ip=req_meta.get("ip"),
        user_agent=req_meta.get("user_agent"),
        meta=merged_meta,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row

