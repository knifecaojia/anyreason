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

export type LLMVirtualKey = {
  id: string;
  purpose: string;
  litellm_key_id?: string | null;
  key_prefix: string;
  status: string;
  created_at: string;
  revoked_at?: string | null;
  expires_at?: string | null;
  last_seen_at?: string | null;
};

export type LLMVirtualKeyIssueResult = {
  token: string;
  record: LLMVirtualKey;
};

export type LLMUsageDaily = {
  id: string;
  user_id: string;
  date: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  cost: string;
};

export type LLMUsageEvent = {
  id: string;
  request_id?: string | null;
  model?: string | null;
  endpoint?: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms?: number | null;
  cost?: string | null;
  created_at: string;
};

export async function llmListMyKeys() {
  return authedFetch<ApiResponse<LLMVirtualKey[]>>({ path: "/api/v1/llm/keys/my" });
}

export async function llmIssueMyKey(input: { purpose?: string; duration_seconds?: number | null }) {
  return authedFetch<ApiResponse<LLMVirtualKeyIssueResult>>({
    method: "POST",
    path: "/api/v1/llm/keys/my/issue",
    body: input,
  });
}

export async function llmRotateMyKey(input: { purpose?: string; duration_seconds?: number | null }) {
  return authedFetch<ApiResponse<LLMVirtualKeyIssueResult>>({
    method: "POST",
    path: "/api/v1/llm/keys/my/rotate",
    body: input,
  });
}

export async function llmRevokeMyKey(keyId: string) {
  return authedFetch<ApiResponse<{ revoked: boolean }>>({
    method: "POST",
    path: `/api/v1/llm/keys/my/revoke/${keyId}`,
  });
}

export async function llmListMyUsageDaily(limit = 30) {
  return authedFetch<ApiResponse<LLMUsageDaily[]>>({
    path: "/api/v1/llm/usage/my/daily",
    query: { limit },
  });
}

export async function llmListMyUsageEvents(limit = 50) {
  return authedFetch<ApiResponse<LLMUsageEvent[]>>({
    path: "/api/v1/llm/usage/my/events",
    query: { limit },
  });
}

export type LLMCustomService = {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  supported_models: string[];
  created_models: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export async function llmAdminListCustomServices() {
  return authedFetch<ApiResponse<LLMCustomService[]>>({ path: "/api/v1/llm/admin/custom-services" });
}

export async function llmAdminCreateCustomService(input: { name: string; base_url: string; api_key: string; models: string[]; enabled?: boolean }) {
  return authedFetch<ApiResponse<LLMCustomService>>({
    method: "POST",
    path: "/api/v1/llm/admin/custom-services",
    body: input,
  });
}

export async function llmAdminDeleteCustomService(serviceId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/llm/admin/custom-services/${serviceId}`,
  });
}

export type LLMAdminModelInfo = { data?: Array<{ model_name: string; litellm_params?: Record<string, unknown>; model_info?: Record<string, unknown> }> };

export async function llmAdminListModels() {
  return authedFetch<ApiResponse<LLMAdminModelInfo>>({ path: "/api/v1/llm/admin/models" });
}

export type LLMChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LLMChatAttachment =
  | { kind: "image"; name?: string | null; content_type?: string | null; data_url: string }
  | { kind: "text"; name?: string | null; content_type?: string | null; text: string };

export type LLMChatResult = { output_text: string; raw: Record<string, unknown> };

export async function llmChatCompletions(input: { model: string; messages: LLMChatMessage[]; attachments?: LLMChatAttachment[] }) {
  return authedFetch<ApiResponse<LLMChatResult>>({
    method: "POST",
    path: "/api/v1/llm/chat",
    body: { model: input.model, messages: input.messages, attachments: input.attachments || [] },
  });
}
