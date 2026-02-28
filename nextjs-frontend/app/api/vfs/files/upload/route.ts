import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return new NextResponse("unauthorized", { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return new NextResponse("Expected multipart/form-data", { status: 400 });
  }

  const formData = await request.formData();
  
  const upstream = await fetch(new URL("/api/v1/vfs/files/upload", getApiBaseUrl()).toString(), {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    cache: "no-store",
  });

  const upstreamBody = await upstream.text();
  return new NextResponse(upstreamBody || upstream.statusText, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}
