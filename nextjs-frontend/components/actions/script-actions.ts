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

export type ApiResponse<T> = { code: number; msg: string; data: T | null };

export type ScriptRead = {
  id: string;
  title: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
};

export type EpisodeRead = {
  id: string;
  episode_number: number;
  title?: string | null;
  script_full_text?: string | null;
};

export type ScriptHierarchyRead = {
  script_id: string;
  episodes: EpisodeRead[];
};

export async function listScripts(page = 1, size = 50) {
  return authedFetch<ApiResponse<Page<ScriptRead>>>({
    path: "/api/v1/scripts",
    query: { page, size },
  });
}

export async function getScriptHierarchy(scriptId: string) {
  return authedFetch<ApiResponse<ScriptHierarchyRead>>({
    path: `/api/v1/scripts/${encodeURIComponent(scriptId)}/hierarchy`,
  });
}

