"use server";

import { cookies } from "next/headers";

import { authJwtLogin } from "@/app/clientService";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/definitions";
import { getErrorMessage } from "@/lib/utils";

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (!value) return null;
  const next = String(value);
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.includes("://")) return null;
  return next;
}

function getLoginErrorDebugSummary(error: unknown): string {
  if (!error || typeof error !== "object") return "non_object_error";
  const err = error as Record<string, unknown>;
  const parts: string[] = [];
  const name = err.name;
  if (typeof name === "string" && name) parts.push(`name=${name}`);
  const code = err.code;
  if (typeof code === "string" && code) parts.push(`code=${code}`);
  const message = err.message;
  if (typeof message === "string" && message) parts.push(`message=${message.slice(0, 120)}`);

  const resp = err.response as Record<string, unknown> | undefined;
  if (resp && typeof resp === "object") {
    const status = resp.status;
    if (typeof status === "number") parts.push(`status=${status}`);
    const data = resp.data;
    const dataType = Array.isArray(data) ? "array" : typeof data;
    parts.push(`dataType=${dataType}`);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const keys = Object.keys(data as Record<string, unknown>).slice(0, 8).join(",");
      if (keys) parts.push(`dataKeys=${keys}`);
    }
  } else {
    const cause = err.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause === "object") {
      const causeMsg = cause.message;
      if (typeof causeMsg === "string" && causeMsg) parts.push(`cause=${causeMsg.slice(0, 120)}`);
    }
  }

  return parts.join(" | ") || "unknown_shape";
}

export async function login(prevState: unknown, formData: FormData) {
  const validatedFields = loginSchema.safeParse({
    username: formData.get("username") as string,
    password: formData.get("password") as string,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password } = validatedFields.data;

  const input = {
    body: {
      username,
      password,
    },
  };

  try {
    const { data } = await authJwtLogin({ ...input, throwOnError: true });
    const token = (data as { access_token?: unknown } | null)?.access_token;
    if (typeof token !== "string") {
      return { server_validation_error: "登录失败：未收到 access_token" };
    }
    
    // Set cookie
    const cookieStore = await cookies();
    const remember = formData.get("remember") === "on";
    const maxAge = remember ? 60 * 60 * 24 * 30 : undefined; // 30 days if remember, otherwise session

    cookieStore.set("accessToken", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: maxAge,
    });
  } catch (err) {
    const msg = getErrorMessage(err);
    // Skip noisy debug dump for server infrastructure errors (500/503)
    const resp = (err as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
    const httpStatus = resp?.status;
    const isServerError = typeof httpStatus === "number" && httpStatus >= 500;
    const debug =
      process.env.NODE_ENV === "production" || isServerError
        ? ""
        : `（${getLoginErrorDebugSummary(err)}）`;
    return {
      server_validation_error: `${msg}${debug}`,
    };
  }
  const nextPath = getSafeNextPath(formData.get("next"));
  redirect(nextPath || "/dashboard");
}
