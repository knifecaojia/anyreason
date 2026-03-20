import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { resolveLocale } from "@/lib/i18n";
import "@/lib/console-timestamp";

const notoSansSc = { variable: "--font-noto-sans-sc" };

export const metadata: Metadata = {
  title: "言之有理 | AI漫剧创作平台",
  description: "AI 漫剧创作平台",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("locale")?.value);

  return (
    <html
      lang={locale}
      className={`dark ${notoSansSc.variable}`}
      suppressHydrationWarning
    >
      <body>
        <LocaleProvider initialLocale={locale}>
          {children}
          <Toaster richColors position="top-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
