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
    if (!data || typeof (data as any).access_token !== "string") {
      return { server_validation_error: "登录失败：未收到 access_token" };
    }
    (await cookies()).set("accessToken", data.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } catch (err) {
    return {
      server_validation_error: getErrorMessage(err),
    };
  }
  const nextPath = getSafeNextPath(formData.get("next"));
  redirect(nextPath || "/dashboard");
}
