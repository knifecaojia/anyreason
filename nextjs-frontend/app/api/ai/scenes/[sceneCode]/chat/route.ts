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

export async function POST(request: Request, context: { params: Promise<{ sceneCode: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { sceneCode } = await context.params;
  const payload = await request.text();

  const upstream = await fetch(new URL(`/api/v1/ai/scenes/${sceneCode}/chat`, getApiBaseUrl()).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });

  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

