"use server";

import { cookies } from "next/headers";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

async function authedFetch<T>(opts: { method?: string; path: string; body?: unknown }): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) throw new Error("未登录：缺少 accessToken");

  const res = await fetch(new URL(opts.path, getApiBaseUrl()).toString(), {
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

export type Me = {
  id: string;
  email: string;
  roles: { id: string; name: string; description?: string | null }[];
  has_avatar: boolean;
};

export async function getMe() {
  return authedFetch<Me>({ path: "/api/v1/users/me" });
}

export async function updateMePassword(input: { current_password: string; new_password: string }) {
  return authedFetch<void>({ method: "PUT", path: "/api/v1/users/me/password", body: input });
}

export async function updateMeAvatar(input: { data_base64: string; content_type: string }) {
  return authedFetch<void>({ method: "PUT", path: "/api/v1/users/me/avatar", body: input });
}

export async function deleteMeAvatar() {
  return authedFetch<void>({ method: "DELETE", path: "/api/v1/users/me/avatar" });
}

