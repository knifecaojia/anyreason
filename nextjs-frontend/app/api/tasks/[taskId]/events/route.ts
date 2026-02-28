import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
}

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const { taskId } = await params;
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const order = url.searchParams.get("order");

  const upstreamUrl = new URL(`/api/v1/tasks/${encodeURIComponent(taskId)}/events`, getApiBaseUrl());
  if (limit) upstreamUrl.searchParams.set("limit", limit);
  if (offset) upstreamUrl.searchParams.set("offset", offset);
  if (order) upstreamUrl.searchParams.set("order", order);

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await upstream.text();
  return new NextResponse(body || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}

