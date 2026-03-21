import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL = process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
      return NextResponse.json(
        { code: 401, msg: "未登录：缺少 accessToken", data: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { category, model_config_id, params } = body;

    if (!category) {
      return NextResponse.json(
        { code: 400, msg: "缺少必需参数：category", data: null },
        { status: 400 }
      );
    }

    // 调用后端 API 获取积分预估
    const response = await fetch(`${API_BASE_URL}/api/v1/ai/cost-estimate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        category,
        model_config_id,
        params,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cost estimate API error:", response.status, errorText);
      return NextResponse.json(
        { code: response.status, msg: `预估服务错误: ${errorText}`, data: null },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Cost estimate API error:", error);
    return NextResponse.json(
      { code: 500, msg: error instanceof Error ? error.message : "内部服务器错误", data: null },
      { status: 200 }
    );
  }
}
