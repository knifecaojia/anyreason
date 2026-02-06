"use server";

import { cookies } from "next/headers";

type FetchOptions = {
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

async function authedFetch<T>(opts: FetchOptions): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) throw new Error("未登录：缺少 accessToken");

  const url = new URL(opts.path, getApiBaseUrl());
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`请求失败 ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type AdminPermission = { id: string; code: string; description?: string | null };
export type AdminRole = { id: string; name: string; description?: string | null; permissions: AdminPermission[] };
export type AdminUser = {
  id: string;
  email: string;
  is_active: boolean;
  is_disabled: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  roles: { id: string; name: string; description?: string | null }[];
  has_avatar: boolean;
};

export type AdminAuditLog = {
  id: string;
  actor_user_id?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  success: boolean;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export async function adminListUsers() {
  return authedFetch<AdminUser[]>({ path: "/api/v1/admin/users" });
}

export async function adminCreateUser(input: { email: string; password: string; role_ids: string[] }) {
  return authedFetch<AdminUser>({
    method: "POST",
    path: "/api/v1/admin/users",
    body: input,
  });
}

export async function adminSetUserRoles(userId: string, roleIds: string[]) {
  return authedFetch<AdminUser>({
    method: "PUT",
    path: `/api/v1/admin/users/${userId}/roles`,
    body: roleIds,
  });
}

export async function adminUpdateUserPassword(userId: string, password: string) {
  return authedFetch<AdminUser>({
    method: "PUT",
    path: `/api/v1/admin/users/${userId}/password`,
    body: { password },
  });
}

export async function adminUpdateUserAvatar(userId: string, input: { data_base64: string; content_type: string }) {
  return authedFetch<AdminUser>({
    method: "PUT",
    path: `/api/v1/admin/users/${userId}/avatar`,
    body: input,
  });
}

export async function adminDeleteUserAvatar(userId: string) {
  return authedFetch<AdminUser>({
    method: "DELETE",
    path: `/api/v1/admin/users/${userId}/avatar`,
  });
}

export async function adminUpdateUserStatus(userId: string, isDisabled: boolean) {
  return authedFetch<AdminUser>({
    method: "PUT",
    path: `/api/v1/admin/users/${userId}/status`,
    body: { is_disabled: isDisabled },
  });
}

export async function adminListRoles() {
  return authedFetch<AdminRole[]>({ path: "/api/v1/admin/roles" });
}

export async function adminCreateRole(input: { name: string; description?: string | null }) {
  return authedFetch<{ id: string; name: string; description?: string | null }>({
    method: "POST",
    path: "/api/v1/admin/roles",
    body: input,
  });
}

export async function adminDeleteRole(roleId: string) {
  return authedFetch<void>({
    method: "DELETE",
    path: `/api/v1/admin/roles/${roleId}`,
  });
}

export async function adminListPermissions() {
  return authedFetch<AdminPermission[]>({ path: "/api/v1/admin/permissions" });
}

export async function adminCreatePermission(input: { code: string; description?: string | null }) {
  return authedFetch<AdminPermission>({
    method: "POST",
    path: "/api/v1/admin/permissions",
    body: input,
  });
}

export async function adminSetRolePermissions(roleId: string, permissionIds: string[]) {
  return authedFetch<AdminRole>({
    method: "PUT",
    path: `/api/v1/admin/roles/${roleId}/permissions`,
    body: permissionIds,
  });
}

export async function adminListAuditLogs(limit: number, offset: number) {
  return authedFetch<AdminAuditLog[]>({
    path: "/api/v1/admin/audit-logs",
    query: { limit, offset },
  });
}

export async function adminCountAuditLogs() {
  return authedFetch<number>({ path: "/api/v1/admin/audit-logs/count" });
}
