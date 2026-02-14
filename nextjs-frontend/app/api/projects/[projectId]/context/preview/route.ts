"use server";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

async function requireToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  return token || "";
}

export async function GET(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const token = await requireToken();
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(`/api/v1/projects/${encodeURIComponent(projectId)}/context/preview`, getApiBaseUrl());
  const excludeTypes = new URL(request.url).searchParams.get("exclude_types");
  if (excludeTypes) url.searchParams.set("exclude_types", excludeTypes);

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const upstreamBody = await upstream.text();
  return new NextResponse(upstreamBody || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}
