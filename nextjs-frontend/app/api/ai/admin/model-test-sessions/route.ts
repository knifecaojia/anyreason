"use server";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  );
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(request.url);
  const upstreamUrl = new URL("/api/v1/ai/admin/model-test-sessions", getApiBaseUrl());
  url.searchParams.forEach((v, k) => upstreamUrl.searchParams.set(k, v));

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const upstreamUrl = new URL("/api/v1/ai/admin/model-test-sessions", getApiBaseUrl()).toString();
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

