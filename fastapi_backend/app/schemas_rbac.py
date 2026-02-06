from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PermissionRead(BaseModel):
    id: UUID
    code: str
    description: str | None = None

    model_config = {"from_attributes": True}


class PermissionCreate(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    description: str | None = None


class PermissionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None


class RoleRead(BaseModel):
    id: UUID
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = None


class RoleWithPermissions(RoleRead):
    permissions: list[PermissionRead] = []


class UserRoleAssignment(BaseModel):
    user_id: UUID
    role_ids: list[UUID]


class RolePermissionAssignment(BaseModel):
    role_id: UUID
    permission_ids: list[UUID]


class AuditLogRead(BaseModel):
    id: UUID
    actor_user_id: UUID | None = None
    action: str
    resource_type: str | None = None
    resource_id: UUID | None = None
    success: bool
    request_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    meta: dict = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserRead(BaseModel):
    id: UUID
    email: str
    is_active: bool
    is_disabled: bool = False
    is_superuser: bool
    is_verified: bool
    roles: list[RoleRead] = []
    has_avatar: bool = False

    model_config = {"from_attributes": True}


class AdminUserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=1024)
    role_ids: list[UUID] = Field(min_length=1)


class AdminUserPasswordUpdate(BaseModel):
    password: str = Field(min_length=8, max_length=1024)


class AvatarUpdate(BaseModel):
    data_base64: str = Field(min_length=1, max_length=10_000_000)
    content_type: str = Field(min_length=1, max_length=128)


class AdminUserStatusUpdate(BaseModel):
    is_disabled: bool


class MeRead(BaseModel):
    id: UUID
    email: str
    roles: list[RoleRead] = []
    has_avatar: bool = False

    model_config = {"from_attributes": True}


class MePasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=8, max_length=1024)
