import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const upstream = await fetch(new URL("/api/v1/ai/models/export", getApiBaseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // 处理文件下载响应
  const contentDisposition = upstream.headers.get("content-disposition");
  const contentType = upstream.headers.get("content-type") || "application/json";
  
  const body = await upstream.blob();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
      ...(contentDisposition && { "content-disposition": contentDisposition }),
    },
  });
}
