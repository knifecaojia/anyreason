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

export type AISceneTestToolOption = { tool_id: string; label: string; uses_agent_codes: string[] };
export type AISceneTestAgentVersionOption = { version: number; is_default: boolean; description?: string | null; created_at?: string | null };
export type AISceneTestAgentOption = { agent_code: string; name: string; category: string; versions: AISceneTestAgentVersionOption[] };
export type AISceneTestOptions = { agents: AISceneTestAgentOption[]; tools: AISceneTestToolOption[] };

export type ApplyPlan = {
  id: string;
  kind: "episode_save" | "asset_create" | "asset_bind" | "asset_doc_upsert" | "storyboard_apply" | "image_prompt_upsert" | "video_prompt_upsert";
  tool_id: string;
  inputs: Record<string, unknown>;
  preview: Record<string, unknown>;
};

export type AISceneTestChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type AISceneTestChatResponse = { output_text: string; plans: ApplyPlan[]; archive?: any };

export async function aiAdminSceneTestOptions() {
  return authedFetch<ApiResponse<AISceneTestOptions>>({
    path: "/api/v1/ai/admin/scene-test/options",
  });
}

export async function aiAdminSceneTestChat(input: {
  main_agent: { agent_code: string; version: number };
  sub_agents: Array<{ agent_code: string; version: number }>;
  tool_ids: string[];
  script_text: string;
  messages: AISceneTestChatMessage[];
  project_id?: string | null;
  context_exclude_types?: string[];
}) {
  return authedFetch<ApiResponse<AISceneTestChatResponse>>({
    method: "POST",
    path: "/api/v1/ai/admin/scene-test/chat",
    body: input,
  });
}
