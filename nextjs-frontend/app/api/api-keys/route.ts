import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  const backendUrl = new URL("/api/v1/api-keys", getApiBaseUrl());
  if (userId) {
    backendUrl.searchParams.set("user_id", userId);
  }

  const upstream = await fetch(backendUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await upstream.text();
  return new NextResponse(body || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const payload = await request.json();
  const upstream = await fetch(new URL("/api/v1/api-keys", getApiBaseUrl()).toString(), {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await upstream.text();
  return new NextResponse(body || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}
