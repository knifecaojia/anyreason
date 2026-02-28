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

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const page = searchParams.get("page") || "1";
  const page_size = searchParams.get("page_size") || "20";

  const params = new URLSearchParams({ page, page_size });
  if (project_id) params.set("project_id", project_id);

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const project_id = searchParams.get("project_id");
    
    const params = new URLSearchParams();
    if (project_id) params.set("project_id", project_id);

    const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions?${params}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("DELETE /api/ai/chat/sessions error:", err);
    return NextResponse.json(
      { code: 500, msg: String(err), data: null },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const upstream = await fetch(`${getApiBaseUrl()}/api/v1/ai/chat/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("POST /api/ai/chat/sessions error:", err);
    return NextResponse.json(
      { code: 500, msg: String(err), data: null },
      { status: 500 }
    );
  }
}
