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

export type Agent = {
  id: string;
  name: string;
  category: string;
  purpose: string;
  ai_model_config_id: string;
  capabilities: string[];
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  credits_per_call: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentPromptVersion = {
  id: string;
  agent_id: string;
  version: number;
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  description?: string | null;
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
  meta: Record<string, unknown>;
};

export async function agentsAdminList() {
  return authedFetch<ApiResponse<Agent[]>>({ path: "/api/v1/agents/admin" });
}

export async function agentsAdminCreate(input: {
  name: string;
  category: string;
  purpose?: string;
  ai_model_config_id: string;
  capabilities?: string[] | null;
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  credits_per_call?: number;
  enabled?: boolean;
}) {
  return authedFetch<ApiResponse<Agent>>({
    method: "POST",
    path: "/api/v1/agents/admin",
    body: input,
  });
}

export async function agentsAdminUpdate(agentId: string, input: Partial<Omit<Agent, "id" | "created_at" | "updated_at">>) {
  return authedFetch<ApiResponse<Agent>>({
    method: "PUT",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}`,
    body: input,
  });
}

export async function agentsAdminDelete(agentId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}`,
  });
}

export async function agentAdminListPromptVersions(agentId: string) {
  return authedFetch<ApiResponse<AgentPromptVersion[]>>({
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions`,
  });
}

export async function agentAdminCreatePromptVersion(
  agentId: string,
  input: {
    system_prompt?: string | null;
    user_prompt_template?: string | null;
    description?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  return authedFetch<ApiResponse<AgentPromptVersion>>({
    method: "POST",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions`,
    body: input,
  });
}

export async function agentAdminUpdatePromptVersion(
  agentId: string,
  version: number,
  input: {
    system_prompt?: string | null;
    user_prompt_template?: string | null;
    description?: string | null;
    meta?: Record<string, unknown> | null;
  }
) {
  return authedFetch<ApiResponse<AgentPromptVersion>>({
    method: "PUT",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions/${encodeURIComponent(String(version))}`,
    body: input,
  });
}

export async function agentAdminDeletePromptVersion(agentId: string, version: number) {
  return authedFetch<ApiResponse<{ ok: boolean }>>({
    method: "DELETE",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions/${encodeURIComponent(String(version))}`,
  });
}

export async function agentAdminActivatePromptVersion(agentId: string, version: number) {
  return authedFetch<ApiResponse<AgentPromptVersion>>({
    method: "POST",
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions/${encodeURIComponent(String(version))}/activate`,
  });
}

export async function agentAdminDiffPromptVersions(agentId: string, fromVersion: number, toVersion: number) {
  return authedFetch<ApiResponse<{ diff: string }>>({
    path: `/api/v1/agents/admin/${encodeURIComponent(agentId)}/prompt-versions/diff`,
    query: { from_version: fromVersion, to_version: toVersion },
  });
}
