import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Resolve backend base URL for server-side requests.
 * Mirrors the chain used in lib/serverApiConfig.ts but with a low-risk
 * Docker-production fallback so middleware does not crash on startup.
 */
function getApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "http://backend:8000")
  );
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("accessToken");

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/users/me`, {
    headers: {
      Authorization: `Bearer ${token.value}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const middleware = proxy;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/scripts/:path*",
    "/extraction/:path*",
    "/ai-scenes/:path*",
    "/ai/:path*",
    "/my-agents/:path*",
    "/assets/:path*",
    "/storyboard/:path*",
    "/studio/:path*",
    "/tasks/:path*",
    "/settings/:path*",
  ],
};
