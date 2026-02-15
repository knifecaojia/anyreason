import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { usersCurrentUser } from "@/app/clientService";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("accessToken");

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const options = {
    headers: {
      Authorization: `Bearer ${token.value}`,
    },
  };

  const { error } = await usersCurrentUser(options);

  if (error) {
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
