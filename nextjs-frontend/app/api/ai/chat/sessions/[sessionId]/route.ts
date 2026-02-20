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

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const body = await request.json();

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
