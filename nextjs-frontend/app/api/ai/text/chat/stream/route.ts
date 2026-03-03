import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getApiBaseUrl() {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8100"
  );
}

/**
 * SSE streaming proxy for /api/v1/ai/text/chat/stream.
 * Passes the request body through and streams the SSE response back to the client.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: string;
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL("/api/v1/ai/text/chat/stream", baseUrl).toString();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: payload,
      cache: "no-store",
    });
  } catch (err) {
    console.error("[stream-proxy] fetch failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Backend unreachable: ${msg}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => upstream.statusText);
    return new NextResponse(errBody || upstream.statusText, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "Empty upstream body" }, { status: 502 });
  }

  // Stream the SSE response directly through
  return new NextResponse(upstream.body as ReadableStream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
