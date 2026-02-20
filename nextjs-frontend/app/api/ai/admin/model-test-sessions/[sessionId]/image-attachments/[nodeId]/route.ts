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

export async function DELETE(_request: Request, context: { params: Promise<{ sessionId: string; nodeId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const { sessionId, nodeId } = await context.params;
  const upstreamUrl = new URL(
    `/api/v1/ai/admin/model-test-sessions/${encodeURIComponent(sessionId)}/image-attachments/${encodeURIComponent(nodeId)}`,
    getApiBaseUrl(),
  ).toString();

  const upstream = await fetch(upstreamUrl, {
    method: "DELETE",
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

