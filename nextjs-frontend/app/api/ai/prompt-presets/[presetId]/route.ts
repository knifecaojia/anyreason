import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

async function requireToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  return token || null;
}

export async function PUT(request: Request, ctx: { params: Promise<{ presetId: string }> }) {
  const { presetId } = await ctx.params;
  const token = await requireToken();
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const body = await request.text();
  const upstream = await fetch(new URL(`/api/v1/ai/prompt-presets/${encodeURIComponent(presetId)}`, getApiBaseUrl()).toString(), {
    method: "PUT",
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

export async function DELETE(_request: Request, ctx: { params: Promise<{ presetId: string }> }) {
  const { presetId } = await ctx.params;
  const token = await requireToken();
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const upstream = await fetch(new URL(`/api/v1/ai/prompt-presets/${encodeURIComponent(presetId)}`, getApiBaseUrl()).toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const upstreamBody = await upstream.text();
  return new NextResponse(upstreamBody || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}
