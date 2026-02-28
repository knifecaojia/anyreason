import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function GET(_request: Request, ctx: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await ctx.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const upstream = await fetch(new URL(`/api/v1/vfs/nodes/${encodeURIComponent(nodeId)}/download`, getApiBaseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "content-disposition": upstream.headers.get("content-disposition") || "",
    },
  });
}

