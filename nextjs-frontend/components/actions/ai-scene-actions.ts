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

export type AdminAIScene = {
  scene_code: string;
  name: string;
  type: string;
  description?: string | null;
  builtin_agent_code?: string | null;
  required_tools: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  ui_config: Record<string, unknown>;
  effective_input_schema: Record<string, unknown>;
  effective_output_schema: Record<string, unknown>;
  is_runnable: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function aiAdminListScenes() {
  return authedFetch<ApiResponse<AdminAIScene[]>>({
    path: "/api/v1/ai/admin/scenes",
  });
}

export async function aiAdminUpdateScene(sceneCode: string, patch: Partial<{
  name: string | null;
  type: string | null;
  description: string | null;
  builtin_agent_code: string | null;
  required_tools: string[] | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  ui_config: Record<string, unknown> | null;
}>) {
  return authedFetch<ApiResponse<AdminAIScene>>({
    method: "PATCH",
    path: `/api/v1/ai/admin/scenes/${encodeURIComponent(sceneCode)}`,
    body: patch,
  });
}

export async function aiSceneRun(sceneCode: string, payload: Record<string, unknown>) {
  return authedFetch<ApiResponse<Record<string, unknown>>>({
    method: "POST",
    path: `/api/v1/scenes/${encodeURIComponent(sceneCode)}/run`,
    body: payload,
  });
}

