import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { resolveLocale } from "@/lib/i18n";

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-noto-sans-sc",
});

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
      className="dark"
      suppressHydrationWarning
    >
      <body className={notoSansSc.variable}>
        <LocaleProvider initialLocale={locale}>
          {children}
          <Toaster richColors position="top-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
