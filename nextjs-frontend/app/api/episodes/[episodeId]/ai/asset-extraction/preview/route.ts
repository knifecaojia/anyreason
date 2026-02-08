"use server";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function POST(request: Request, ctx: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await ctx.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const body = await request.text();
  const upstream = await fetch(new URL(`/api/v1/episodes/${encodeURIComponent(episodeId)}/ai/asset-extraction/preview`, getApiBaseUrl()).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": request.headers.get("content-type") || "application/json" },
    body,
    cache: "no-store",
  });

  const upstreamBody = await upstream.text();
  return new NextResponse(upstreamBody || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}

