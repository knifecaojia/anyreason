"use server";

import { cookies } from "next/headers";
import { getServerApiBaseUrl } from "@/lib/serverApiConfig";

async function authedFetch<T>(opts: { method?: string; path: string; body?: unknown }): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) throw new Error("未登录：缺少 accessToken");

  const res = await fetch(new URL(opts.path, getServerApiBaseUrl()).toString(), {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
       // Token invalid or expired
       // Return null or throw specific error that layout can handle?
       // For Server Actions used in Client Components, throwing error is okay.
       // For Server Components (like Layout), this will crash the page if not caught.
       // Let's return null for getMe to indicate not logged in, but authedFetch is generic.
       // We should update getMe to handle 401 gracefully.
       throw new Error("Unauthorized");
    }
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
  try {
    return await authedFetch<Me>({ path: "/api/v1/users/me" });
  } catch (e: any) {
    if (e.message === "Unauthorized" || e.message?.includes("未登录")) {
        return null; 
    }
    // Other errors might be temporary network issues
    console.error("getMe error:", e);
    return null;
  }
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

