"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login } from "@/components/actions/login-action";
import { useActionState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submitButton";
import { FieldError, FormError } from "@/components/ui/FormError";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function Page() {
  const [state, dispatch] = useActionState(login, undefined);
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get?.("next") || "";

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
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900 px-2 sm:px-4">
      <form action={dispatch} className="w-full flex justify-center">
        <input type="hidden" name="next" value={nextPath} readOnly />
        <Card className="w-full max-w-[30rem] rounded-lg shadow-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold text-gray-800 dark:text-white">
              {t("login.title")}
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
              {t("login.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-6">
            <div className="grid gap-3">
              <Label
                htmlFor="username"
                className="text-gray-700 dark:text-gray-300"
              >
                {t("login.username")}
              </Label>
              <Input
                id="username"
                name="username"
                type="email"
                placeholder="m@example.com"
                defaultValue={prefillEmail}
                required
                className="border-gray-300 dark:border-gray-600"
              />
              <FieldError state={state} field="username" />
            </div>
            <div className="grid gap-3">
              <Label
                htmlFor="password"
                className="text-gray-700 dark:text-gray-300"
              >
                {t("login.password")}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                defaultValue={prefillPassword}
                required
                className="border-gray-300 dark:border-gray-600"
              />
              <FieldError state={state} field="password" />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" name="remember" />
                  <label
                    htmlFor="remember"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 dark:text-gray-300"
                  >
                    {t("login.rememberMe")}
                  </label>
                </div>
                <Link
                  href="/password-recovery"
                  className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
            </div>
            <SubmitButton text={t("login.signIn")} />
            <FormError state={state} />
            <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {t("login.noAccount")}{" "}
              <Link
                href="/register"
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
              >
                {t("login.signUp")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
