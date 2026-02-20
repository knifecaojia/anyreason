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

export type AIManufacturer = {
  id: string;
  code: string;
  name: string;
  category: string;
  provider_class: string | null;
  default_base_url: string | null;
  logo_url: string | null;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AIModel = {
  id: string;
  manufacturer_id: string;
  code: string;
  name: string;
  response_format: string;
  supports_image: boolean;
  supports_think: boolean;
  supports_tool: boolean;
  context_window: number | null;
  metadata: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  manufacturer?: AIManufacturer | null;
};

export type AICatalogItem = {
  manufacturer_code: string;
  manufacturer_name: string;
  model_code: string;
  model_name: string;
  category: string;
  response_format: string;
  supports_image: boolean;
  supports_think: boolean;
  supports_tool: boolean;
  default_base_url: string | null;
};

// ==================== Manufacturer APIs ====================

export async function aiAdminListManufacturers(category?: string) {
  return authedFetch<ApiResponse<AIManufacturer[]>>({
    path: "/api/v1/ai/admin/manufacturers",
    query: { category },
  });
}

export async function aiAdminCreateManufacturer(input: {
  code: string;
  name: string;
  category: string;
  provider_class?: string | null;
  default_base_url?: string | null;
  logo_url?: string | null;
  description?: string | null;
  enabled?: boolean;
  sort_order?: number;
}) {
  return authedFetch<ApiResponse<AIManufacturer>>({
    method: "POST",
    path: "/api/v1/ai/admin/manufacturers",
    body: input,
  });
}

export async function aiAdminUpdateManufacturer(
  manufacturerId: string,
  input: Partial<{
    code: string;
    name: string;
    category: string;
    provider_class: string | null;
    default_base_url: string | null;
    logo_url: string | null;
    description: string | null;
    enabled: boolean;
    sort_order: number;
  }>,
) {
  return authedFetch<ApiResponse<AIManufacturer>>({
    method: "PUT",
    path: `/api/v1/ai/admin/manufacturers/${encodeURIComponent(manufacturerId)}`,
    body: input,
  });
}

export async function aiAdminDeleteManufacturer(manufacturerId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/ai/admin/manufacturers/${encodeURIComponent(manufacturerId)}`,
  });
}

// ==================== Model APIs ====================

export async function aiAdminListModels(manufacturerId?: string, category?: string) {
  return authedFetch<ApiResponse<AIModel[]>>({
    path: "/api/v1/ai/admin/models",
    query: { manufacturer_id: manufacturerId, category },
  });
}

export async function aiAdminCreateModel(input: {
  manufacturer_id: string;
  code: string;
  name: string;
  response_format?: string;
  supports_image?: boolean;
  supports_think?: boolean;
  supports_tool?: boolean;
  context_window?: number | null;
  model_metadata?: Record<string, unknown>;
  enabled?: boolean;
  sort_order?: number;
}) {
  return authedFetch<ApiResponse<AIModel>>({
    method: "POST",
    path: "/api/v1/ai/admin/models",
    body: input,
  });
}

export async function aiAdminUpdateModel(
  modelId: string,
  input: Partial<{
    code: string;
    name: string;
    response_format: string;
    supports_image: boolean;
    supports_think: boolean;
    supports_tool: boolean;
    context_window: number | null;
    metadata: Record<string, unknown>;
    enabled: boolean;
    sort_order: number;
  }>,
) {
  return authedFetch<ApiResponse<AIModel>>({
    method: "PUT",
    path: `/api/v1/ai/admin/models/${encodeURIComponent(modelId)}`,
    body: input,
  });
}

export async function aiAdminDeleteModel(modelId: string) {
  return authedFetch<ApiResponse<{ deleted: boolean }>>({
    method: "DELETE",
    path: `/api/v1/ai/admin/models/${encodeURIComponent(modelId)}`,
  });
}

// ==================== Public Catalog API ====================

export async function aiGetCatalog(category?: string) {
  return authedFetch<ApiResponse<AICatalogItem[]>>({
    path: "/api/v1/ai/catalog",
    query: { category },
  });
}
