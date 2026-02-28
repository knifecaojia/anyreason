import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function GET(_request: Request, ctx: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await ctx.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const upstream = await fetch(new URL(`/api/v1/scripts/${encodeURIComponent(scriptId)}/panorama/thumbnail`, getApiBaseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new NextResponse(text || upstream.statusText, { status: upstream.status });
  }

  const res = new NextResponse(upstream.body, { status: 200 });
  res.headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  res.headers.set("content-disposition", upstream.headers.get("content-disposition") || "inline");
  res.headers.set("cache-control", "private, max-age=60");
  return res;
}

