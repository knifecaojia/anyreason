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

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { sessionId } = await context.params;
  const payload = await request.text();

  const url = `${getApiBaseUrl()}/api/v1/ai/chat/sessions/${sessionId}/messages`;
  console.log(`Proxying request to: ${url}`);

  try {
    const upstream = await fetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Connection": "close",
        },
        body: payload,
        cache: "no-store",
      }
    );

    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") || "text/event-stream");
    headers.set("cache-control", "no-cache");
    headers.set("x-accel-buffering", "no");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("Proxy fetch error:", error);
    return new NextResponse(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}
