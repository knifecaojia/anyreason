import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const getApiBaseUrl = () =>
  process.env.INTERNAL_API_BASE_URL || "http://localhost:8100";

/**
 * Generic proxy helper for canvas API routes.
 * Reads accessToken from cookies, forwards the request to the FastAPI backend,
 * and returns the backend response.
 */
export async function proxyToBackend(
  request: Request,
  backendPath: string,
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const backendUrl = new URL(backendPath, getApiBaseUrl());
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
      cache: "no-store",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        const body = await request.text();
        if (body) init.body = body;
      } catch {
        // no body
      }
    }

    const res = await fetch(backendUrl.toString(), init);

    // For non-JSON responses (e.g., file downloads), pass through directly
    const resContentType = res.headers.get("content-type") || "";
    if (!resContentType.includes("json")) {
      const data = await res.arrayBuffer();
      return new NextResponse(data, {
        status: res.status,
        headers: {
          "Content-Type": resContentType,
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error(`[canvas-proxy] Error proxying ${request.method} ${backendPath}:`, error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { detail: `Proxy error: ${msg}` },
      { status: 500 },
    );
  }
}
