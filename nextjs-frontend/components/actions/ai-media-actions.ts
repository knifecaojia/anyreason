"use server";

import { cookies } from "next/headers";
import { MediaModelConfig, MediaGenerationRequest, MediaGenerationResponse, ManufacturerWithModels } from "@/lib/aistudio/types";

type ApiResponse<T> = { code: number; msg: string; data: T | null };

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

async function authedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) throw new Error("未登录");

  const url = new URL(path, getApiBaseUrl());
  
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...options.headers as any,
  };

  const res = await fetch(url.toString(), {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`请求失败 ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.code !== 200) {
      throw new Error(json.msg || "Unknown error");
  }
  return json.data as T;
}

export async function listMediaModels(category?: string) {
  let path = "/api/v1/media/models";
  if (category) path += `?category=${category}`;
  return authedFetch<MediaModelConfig[]>(path);
}

export async function generateMedia(payload: MediaGenerationRequest) {
  return authedFetch<MediaGenerationResponse>("/api/v1/media/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listModelsWithCapabilities(category: string) {
  return authedFetch<ManufacturerWithModels[]>(
    `/api/v1/ai/catalog/models?category=${category}`
  );
}
