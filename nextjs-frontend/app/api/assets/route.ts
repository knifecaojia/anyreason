import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const getApiBaseUrl = () => {
  return process.env.INTERNAL_API_BASE_URL || "http://localhost:8100";
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const backendUrl = new URL("/api/v1/assets", getApiBaseUrl());
  searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });

  try {
    const res = await fetch(backendUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error fetching assets:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const backendUrl = new URL("/api/v1/assets", getApiBaseUrl());

    const res = await fetch(backendUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error creating asset:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
