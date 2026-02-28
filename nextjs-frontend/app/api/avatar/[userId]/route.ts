import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function GET(_request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const upstream = await fetch(new URL(`/api/v1/users/${userId}/avatar`, getApiBaseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new NextResponse(text || upstream.statusText, { status: upstream.status });
  }

  const buf = await upstream.arrayBuffer();
  const res = new NextResponse(buf, { status: 200 });
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  res.headers.set("content-type", contentType);
  res.headers.set("cache-control", "private, max-age=60");
  return res;
}

