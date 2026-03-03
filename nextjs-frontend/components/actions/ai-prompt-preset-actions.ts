'use server';

/**
 * Frontend server actions for AIPromptPreset CRUD.
 * Calls FastAPI backend /api/v1/ai/prompt-presets endpoints.
 */

import { cookies } from 'next/headers';

type FetchOptions = {
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
}

async function authedFetch<T>(opts: FetchOptions): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) throw new Error('未登录：缺少 accessToken');

  const url = new URL(opts.path, getApiBaseUrl());
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`请求失败 ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type ApiResponse<T> = { code: number; msg: string; data: T | null };

// ===== Types =====

export interface AIPromptPresetRead {
  id: string;
  tool_key: string;
  name: string;
  provider: string | null;
  model: string | null;
  prompt_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIPromptPresetCreateInput {
  tool_key: string;
  name: string;
  provider?: string | null;
  model?: string | null;
  prompt_template: string;
  is_default?: boolean;
}

export interface AIPromptPresetUpdateInput {
  name?: string;
  provider?: string | null;
  model?: string | null;
  prompt_template?: string;
  is_default?: boolean;
}

// ===== Actions =====

export async function listPromptPresets(toolKey?: string) {
  return authedFetch<ApiResponse<AIPromptPresetRead[]>>({
    path: '/api/v1/ai/prompt-presets',
    query: toolKey ? { tool_key: toolKey } : undefined,
  });
}

export async function createPromptPreset(input: AIPromptPresetCreateInput) {
  return authedFetch<ApiResponse<AIPromptPresetRead>>({
    method: 'POST',
    path: '/api/v1/ai/prompt-presets',
    body: input,
  });
}

export async function updatePromptPreset(presetId: string, input: AIPromptPresetUpdateInput) {
  return authedFetch<ApiResponse<AIPromptPresetRead>>({
    method: 'PUT',
    path: `/api/v1/ai/prompt-presets/${encodeURIComponent(presetId)}`,
    body: input,
  });
}

export async function deletePromptPreset(presetId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: 'DELETE',
    path: `/api/v1/ai/prompt-presets/${encodeURIComponent(presetId)}`,
  });
}
