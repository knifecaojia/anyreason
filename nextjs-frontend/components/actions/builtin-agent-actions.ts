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

export type BuiltinAgent = {
  id: string;
  agent_code: string;
  name: string;
  description?: string | null;
  category: string;
  default_ai_model_config_id?: string | null;
  tools: string[];
};

export type BuiltinAgentPromptVersion = {
  id: string;
  builtin_agent_id: string;
  version: number;
  system_prompt: string;
  ai_model_config_id?: string | null;
  description?: string | null;
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
  meta: Record<string, unknown>;
};

export async function builtinAgentsAdminList() {
  return authedFetch<ApiResponse<BuiltinAgent[]>>({ path: "/api/v1/admin/builtin-agents" });
}

export async function builtinAgentAdminListVersions(agentCode: string) {
  return authedFetch<ApiResponse<BuiltinAgentPromptVersion[]>>({
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions`,
  });
}

export async function builtinAgentAdminUpdate(agentCode: string, input: { default_ai_model_config_id?: string | null }) {
  return authedFetch<ApiResponse<BuiltinAgent>>({
    method: "PUT",
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}`,
    body: input,
  });
}

export async function builtinAgentAdminCreateVersion(
  agentCode: string,
  input: { system_prompt: string; ai_model_config_id?: string | null; description?: string | null; meta?: Record<string, unknown> }
) {
  return authedFetch<ApiResponse<BuiltinAgentPromptVersion>>({
    method: "POST",
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions`,
    body: input,
  });
}

export async function builtinAgentAdminUpdateVersion(
  agentCode: string,
  version: number,
  input: {
    system_prompt?: string | null;
    ai_model_config_id?: string | null;
    description?: string | null;
    meta?: Record<string, unknown> | null;
  }
) {
  return authedFetch<ApiResponse<BuiltinAgentPromptVersion>>({
    method: "PUT",
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions/${encodeURIComponent(String(version))}`,
    body: input,
  });
}

export async function builtinAgentAdminDeleteVersion(agentCode: string, version: number) {
  return authedFetch<ApiResponse<{ ok: boolean }>>({
    method: "DELETE",
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions/${encodeURIComponent(String(version))}`,
  });
}

export async function builtinAgentAdminActivateVersion(agentCode: string, version: number) {
  return authedFetch<ApiResponse<BuiltinAgentPromptVersion>>({
    method: "POST",
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions/${encodeURIComponent(String(version))}/activate`,
  });
}

export async function builtinAgentAdminDiffVersions(agentCode: string, fromVersion: number, toVersion: number) {
  return authedFetch<ApiResponse<{ diff: string }>>({
    path: `/api/v1/admin/builtin-agents/${encodeURIComponent(agentCode)}/versions/diff`,
    query: { from_version: fromVersion, to_version: toVersion },
  });
}
