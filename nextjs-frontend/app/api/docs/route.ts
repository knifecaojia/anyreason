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

  const upstream = await fetch(new URL("/docs", getApiBaseUrl()).toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  let body = await upstream.text();
  
  // FastAPI's get_swagger_ui_html templates usually use "url: '/openapi.json'" or similar.
  // We need to catch various quoting and spacing possibilities.
  body = body.replace(/(url|openapi_url)\s*:\s*['"]\/openapi\.json['"]/g, '$1: "/api/openapi.json"');
  
  // Also catch any other standalone occurrences just in case
  body = body.replace(/['"]\/openapi\.json['"]/g, '"/api/openapi.json"');

  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "text/html" },
  });
}
