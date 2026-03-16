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

export type AICategory = "text" | "image" | "video";

export type AIModelKeyInfo = {
  id: string;
  api_key: string;
  concurrency_limit: number;
  enabled: boolean;
  note?: string | null;
};

export type AIModelConfig = {
  id: string;
  category: AICategory;
  manufacturer: string;
  model: string;
  base_url?: string | null;
  enabled: boolean;
  sort_order: number;
  has_api_key: boolean;
  plaintext_api_key?: string | null;
  api_keys_info?: AIModelKeyInfo[] | null;
  created_at: string;
  updated_at: string;
};

export type AIModelBinding = {
  id: string;
  key: string;
  category: AICategory;
  ai_model_config_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type AIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AdminAIModelConfigTestChatResult = {
  output_text: string;
  raw: Record<string, unknown>;
};

export async function aiAdminListModelConfigs(category?: AICategory) {
  return authedFetch<ApiResponse<AIModelConfig[]>>({
    path: "/api/v1/ai/admin/model-configs",
    query: { category },
  });
}

export async function aiAdminCreateModelConfig(input: {
  category: AICategory;
  manufacturer: string;
  model: string;
  base_url?: string | null;
  api_key?: string | null;
  plaintext_api_key?: string | null;
  api_keys_info?: AIModelKeyInfo[] | null;
  enabled?: boolean;
  sort_order?: number;
}) {
  return authedFetch<ApiResponse<AIModelConfig>>({
    method: "POST",
    path: "/api/v1/ai/admin/model-configs",
    body: input,
  });
}

export async function aiAdminUpdateModelConfig(
  modelConfigId: string,
  input: Partial<{
    category: AICategory;
    manufacturer: string;
    model: string;
    base_url: string | null;
    api_key: string | null;
    plaintext_api_key: string | null;
    api_keys_info: AIModelKeyInfo[] | null;
    enabled: boolean;
    sort_order: number;
  }>,
) {
  return authedFetch<ApiResponse<AIModelConfig>>({
    method: "PUT",
    path: `/api/v1/ai/admin/model-configs/${encodeURIComponent(modelConfigId)}`,
    body: input,
  });
}

export async function aiAdminDeleteModelConfig(modelConfigId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/ai/admin/model-configs/${encodeURIComponent(modelConfigId)}`,
  });
}

export async function aiAdminListBindings(category?: AICategory) {
  return authedFetch<ApiResponse<AIModelBinding[]>>({
    path: "/api/v1/ai/admin/bindings",
    query: { category },
  });
}

export async function aiAdminUpsertBinding(input: { key: string; category: AICategory; ai_model_config_id?: string | null }) {
  return authedFetch<ApiResponse<AIModelBinding>>({
    method: "POST",
    path: "/api/v1/ai/admin/bindings",
    body: input,
  });
}

export async function aiAdminDeleteBinding(bindingId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/ai/admin/bindings/${encodeURIComponent(bindingId)}`,
  });
}

export async function aiAdminTestChat(modelConfigId: string, messages: AIChatMessage[]) {
  return authedFetch<ApiResponse<AdminAIModelConfigTestChatResult>>({
    method: "POST",
    path: `/api/v1/ai/admin/model-configs/${encodeURIComponent(modelConfigId)}/test-chat`,
    body: { messages },
  });
}
