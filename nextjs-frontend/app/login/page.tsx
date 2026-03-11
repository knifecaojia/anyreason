import { cookies } from "next/headers";
import { LoginForm } from "./LoginForm";

export default async function Page() {
  const cookieStore = await cookies();
  const rememberedUsername = cookieStore.get("rememberedUsername")?.value;

  const shouldPrefill =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_LOGIN_PREFILL === "true";
  const prefillEmail = shouldPrefill
    ? process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? ""
    : undefined;
  const prefillPassword = shouldPrefill
    ? process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? ""
    : undefined;

  return (
    <LoginForm 
      initialUsername={rememberedUsername} 
      prefillEmail={prefillEmail}
      prefillPassword={prefillPassword}
    />
  );
}
