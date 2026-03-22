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

export type CreditAccount = {
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type CreditTransaction = {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  actor_user_id?: string | null;
  meta?: Record<string, unknown>;
  created_at: string;
  // Task 6 enriched fields for traceability
  trace_type?: string | null;
  operation_display?: string | null;
  is_refund?: boolean;
  linked_event_id?: string | null;
  category?: string | null;
  model_display?: string | null;
};

export async function creditsMy() {
  return authedFetch<ApiResponse<{ balance: number }>>({ path: "/api/v1/credits/my" });
}

export async function creditsMyTransactions(limit = 50) {
  return authedFetch<ApiResponse<CreditTransaction[]>>({
    path: "/api/v1/credits/my/transactions",
    query: { limit },
  });
}

export async function creditsAdminGetUser(userId: string, limit = 50) {
  return authedFetch<ApiResponse<{ account: CreditAccount; transactions: CreditTransaction[] }>>({
    path: `/api/v1/credits/admin/users/${encodeURIComponent(userId)}`,
    query: { limit },
  });
}

export async function creditsAdminAdjustUser(userId: string, input: { delta: number; reason?: string; meta?: Record<string, unknown> | null }) {
  return authedFetch<ApiResponse<CreditAccount>>({
    method: "POST",
    path: `/api/v1/credits/admin/users/${encodeURIComponent(userId)}/adjust`,
    body: input,
  });
}

export async function creditsAdminSetUser(userId: string, input: { balance: number; reason?: string; meta?: Record<string, unknown> | null }) {
  return authedFetch<ApiResponse<CreditAccount>>({
    method: "POST",
    path: `/api/v1/credits/admin/users/${encodeURIComponent(userId)}/set`,
    body: input,
  });
}

