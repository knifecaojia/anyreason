from __future__ import annotations

from uuid import UUID

import base64

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from fastapi_users.password import PasswordHelper
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_log
from app.database import get_async_session
from app.models import AuditLog, Permission, Role, RolePermission, User, UserRole
from app.rbac import require_permissions
from app.schemas_rbac import (
    AdminUserCreate,
    AdminUserPasswordUpdate,
    AdminUserRead,
    AdminUserStatusUpdate,
    AvatarUpdate,
    AuditLogRead,
    PermissionCreate,
    PermissionRead,
    PermissionUpdate,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    RoleWithPermissions,
)


router = APIRouter(prefix="/admin")


async def _role_list_for_user(session: AsyncSession, user_id: UUID) -> list[Role]:
    rows = (
        await session.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
            .order_by(Role.name.asc())
        )
    ).scalars().all()
    return list(rows)


async def _permission_list_for_role(session: AsyncSession, role_id: UUID) -> list[Permission]:
    rows = (
        await session.execute(
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
            .order_by(Permission.code.asc())
        )
    ).scalars().all()
    return list(rows)


@router.get(
    "/users",
    response_model=list[AdminUserRead],
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def list_users(session: AsyncSession = Depends(get_async_session)) -> list[AdminUserRead]:
    users = (await session.execute(select(User).order_by(User.email.asc()))).scalars().all()
    out: list[AdminUserRead] = []
    for u in users:
        roles = await _role_list_for_user(session, u.id)
        out.append(
            AdminUserRead(
                id=u.id,
                email=u.email,
                is_active=u.is_active,
                is_disabled=bool(getattr(u, "is_disabled", False)),
                is_superuser=u.is_superuser,
                is_verified=u.is_verified,
                roles=[RoleRead.model_validate(r) for r in roles],
                has_avatar=bool(getattr(u, "avatar_data", None)),
            )
        )
    return out


@router.post(
    "/users",
    response_model=AdminUserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def create_user(
    request: Request,
    payload: AdminUserCreate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    existing = (
        await session.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_already_exists")

    role_rows = (
        await session.execute(select(Role).where(Role.id.in_(payload.role_ids)))
    ).scalars().all()
    roles_by_id = {r.id: r for r in role_rows}
    missing = [rid for rid in payload.role_ids if rid not in roles_by_id]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")
    is_superuser = any(r.name.lower() == "admin" for r in role_rows)

    user = User(
        email=payload.email,
        hashed_password=PasswordHelper().hash(payload.password),
        is_active=True,
        is_superuser=is_superuser,
        is_verified=True,
    )
    session.add(user)
    await session.flush()

    for r in role_rows:
        session.add(UserRole(user_id=user.id, role_id=r.id))
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.create",
        resource_type="user",
        resource_id=user.id,
        meta={
            "email": payload.email,
            "role_ids": [str(r.id) for r in role_rows],
            "role_names": [r.name for r in role_rows],
            "is_superuser": is_superuser,
        },
    )

    roles = await _role_list_for_user(session, user.id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.put(
    "/users/{user_id}/password",
    response_model=AdminUserRead,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def admin_update_user_password(
    request: Request,
    user_id: UUID,
    payload: AdminUserPasswordUpdate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    user.hashed_password = PasswordHelper().hash(payload.password)
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.password_update",
        resource_type="user",
        resource_id=user_id,
        meta={},
    )

    roles = await _role_list_for_user(session, user.id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.put(
    "/users/{user_id}/avatar",
    response_model=AdminUserRead,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def admin_update_user_avatar(
    request: Request,
    user_id: UUID,
    payload: AvatarUpdate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    try:
        raw = base64.b64decode(payload.data_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_avatar_data")
    if len(raw) > 100 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="avatar_too_large")

    user.avatar_content_type = payload.content_type
    user.avatar_data = raw
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.avatar_update",
        resource_type="user",
        resource_id=user_id,
        meta={"content_type": payload.content_type, "size": len(raw)},
    )

    roles = await _role_list_for_user(session, user.id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.delete(
    "/users/{user_id}/avatar",
    response_model=AdminUserRead,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def admin_delete_user_avatar(
    request: Request,
    user_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    user.avatar_content_type = None
    user.avatar_data = None
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.avatar_delete",
        resource_type="user",
        resource_id=user_id,
        meta={},
    )

    roles = await _role_list_for_user(session, user.id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.put(
    "/users/{user_id}/status",
    response_model=AdminUserRead,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def admin_update_user_status(
    request: Request,
    user_id: UUID,
    payload: AdminUserStatusUpdate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    user.is_disabled = payload.is_disabled
    user.is_active = not payload.is_disabled
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.status_update",
        resource_type="user",
        resource_id=user_id,
        meta={"is_disabled": payload.is_disabled},
    )

    roles = await _role_list_for_user(session, user_id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.put(
    "/users/{user_id}/roles",
    response_model=AdminUserRead,
    dependencies=[Depends(require_permissions(["system.users"]))],
)
async def set_user_roles(
    request: Request,
    user_id: UUID,
    role_ids: list[UUID] = Body(...),
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.users"])),
) -> AdminUserRead:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    try:
        await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
        if role_ids:
            roles = (
                await session.execute(select(Role).where(Role.id.in_(role_ids)))
            ).scalars().all()
            found_ids = {r.id for r in roles}
            missing = [str(rid) for rid in role_ids if rid not in found_ids]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"message": "unknown_roles", "role_ids": missing},
                )
            for r in roles:
                session.add(UserRole(user_id=user_id, role_id=r.id))
            user.is_superuser = any(r.name.lower() == "admin" for r in roles)
        else:
            user.is_superuser = False
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="user.roles.set",
        resource_type="user",
        resource_id=user_id,
        meta={"role_ids": [str(rid) for rid in role_ids]},
    )

    roles = await _role_list_for_user(session, user_id)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_disabled=bool(getattr(user, "is_disabled", False)),
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        roles=[RoleRead.model_validate(r) for r in roles],
        has_avatar=bool(getattr(user, "avatar_data", None)),
    )


@router.get(
    "/roles",
    response_model=list[RoleWithPermissions],
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def list_roles(session: AsyncSession = Depends(get_async_session)) -> list[RoleWithPermissions]:
    roles = (await session.execute(select(Role).order_by(Role.name.asc()))).scalars().all()
    out: list[RoleWithPermissions] = []
    for r in roles:
        perms = await _permission_list_for_role(session, r.id)
        out.append(
            RoleWithPermissions(
                **RoleRead.model_validate(r).model_dump(),
                permissions=[PermissionRead.model_validate(p) for p in perms],
            )
        )
    return out


@router.post(
    "/roles",
    response_model=RoleRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def create_role(
    request: Request,
    payload: RoleCreate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> RoleRead:
    row = Role(name=payload.name, description=payload.description)
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="role_already_exists")

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="role.create",
        resource_type="role",
        resource_id=row.id,
        meta={"name": payload.name},
    )
    return RoleRead.model_validate(row)


@router.patch(
    "/roles/{role_id}",
    response_model=RoleRead,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def update_role(
    request: Request,
    role_id: UUID,
    payload: RoleUpdate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> RoleRead:
    row = (await session.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")
    if payload.name is not None:
        row.name = payload.name
    if payload.description is not None:
        row.description = payload.description
    try:
        await session.commit()
        await session.refresh(row)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="role_already_exists")

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="role.update",
        resource_type="role",
        resource_id=role_id,
        meta=payload.model_dump(exclude_none=True),
    )
    return RoleRead.model_validate(row)


@router.delete(
    "/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def delete_role(
    request: Request,
    role_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> Response:
    row = (await session.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")
    await session.delete(row)
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="role.delete",
        resource_type="role",
        resource_id=role_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/roles/{role_id}/permissions",
    response_model=RoleWithPermissions,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def set_role_permissions(
    request: Request,
    role_id: UUID,
    permission_ids: list[UUID] = Body(...),
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> RoleWithPermissions:
    role = (await session.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")

    try:
        await session.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
        if permission_ids:
            perms = (
                await session.execute(select(Permission).where(Permission.id.in_(permission_ids)))
            ).scalars().all()
            found_ids = {p.id for p in perms}
            missing = [str(pid) for pid in permission_ids if pid not in found_ids]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"message": "unknown_permissions", "permission_ids": missing},
                )
            for p in perms:
                session.add(RolePermission(role_id=role_id, permission_id=p.id))
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="role.permissions.set",
        resource_type="role",
        resource_id=role_id,
        meta={"permission_ids": [str(pid) for pid in permission_ids]},
    )

    perms = await _permission_list_for_role(session, role_id)
    return RoleWithPermissions(
        **RoleRead.model_validate(role).model_dump(),
        permissions=[PermissionRead.model_validate(p) for p in perms],
    )


@router.get(
    "/permissions",
    response_model=list[PermissionRead],
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def list_permissions(session: AsyncSession = Depends(get_async_session)) -> list[PermissionRead]:
    rows = (await session.execute(select(Permission).order_by(Permission.code.asc()))).scalars().all()
    return [PermissionRead.model_validate(p) for p in rows]


@router.post(
    "/permissions",
    response_model=PermissionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def create_permission(
    request: Request,
    payload: PermissionCreate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> PermissionRead:
    row = Permission(code=payload.code, description=payload.description)
    session.add(row)
    try:
        await session.commit()
        await session.refresh(row)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="permission_already_exists",
        )

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="permission.create",
        resource_type="permission",
        resource_id=row.id,
        meta={"code": payload.code},
    )
    return PermissionRead.model_validate(row)


@router.patch(
    "/permissions/{permission_id}",
    response_model=PermissionRead,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def update_permission(
    request: Request,
    permission_id: UUID,
    payload: PermissionUpdate,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> PermissionRead:
    row = (
        await session.execute(select(Permission).where(Permission.id == permission_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="permission_not_found")
    if payload.code is not None:
        row.code = payload.code
    if payload.description is not None:
        row.description = payload.description
    try:
        await session.commit()
        await session.refresh(row)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="permission_already_exists",
        )

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="permission.update",
        resource_type="permission",
        resource_id=permission_id,
        meta=payload.model_dump(exclude_none=True),
    )
    return PermissionRead.model_validate(row)


@router.delete(
    "/permissions/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permissions(["system.roles"]))],
)
async def delete_permission(
    request: Request,
    permission_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    actor: User = Depends(require_permissions(["system.roles"])),
) -> Response:
    row = (
        await session.execute(select(Permission).where(Permission.id == permission_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="permission_not_found")
    await session.delete(row)
    await session.commit()

    await write_audit_log(
        session=session,
        request=request,
        actor_user_id=actor.id,
        action="permission.delete",
        resource_type="permission",
        resource_id=permission_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/audit-logs",
    response_model=list[AuditLogRead],
    dependencies=[Depends(require_permissions(["system.audit"]))],
)
async def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_async_session),
) -> list[AuditLogRead]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    rows = (
        await session.execute(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [AuditLogRead.model_validate(r) for r in rows]


@router.get(
    "/audit-logs/count",
    response_model=int,
    dependencies=[Depends(require_permissions(["system.audit"]))],
)
async def count_audit_logs(session: AsyncSession = Depends(get_async_session)) -> int:
    return int((await session.execute(select(func.count(AuditLog.id)))).scalar_one())
