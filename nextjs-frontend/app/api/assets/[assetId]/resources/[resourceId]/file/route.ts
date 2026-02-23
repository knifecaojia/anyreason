import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8100";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string; resourceId: string }> }
) {
  const { assetId, resourceId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    new URL(
      `/api/v1/assets/${encodeURIComponent(assetId)}/resources/${encodeURIComponent(resourceId)}/download`,
      getApiBaseUrl()
    ).toString(),
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    return new NextResponse(text || upstream.statusText, { status: upstream.status });
  }

  // @ts-ignore: upstream.body is a ReadableStream which NextResponse accepts
  const res = new NextResponse(upstream.body, { status: 200 });
  
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentDisposition = upstream.headers.get("content-disposition") || "attachment";
  
  res.headers.set("content-type", contentType);
  res.headers.set("content-disposition", contentDisposition);
  res.headers.set("cache-control", "private, max-age=60");
  
  return res;
}
