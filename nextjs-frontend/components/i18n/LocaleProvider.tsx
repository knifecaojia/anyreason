"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultLocale, Locale, resolveLocale, translate } from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function setCookie(name: string, value: string) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? defaultLocale);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      setLocaleState(nextLocale);
      setCookie("locale", nextLocale);
      document.documentElement.lang = nextLocale;
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t: (key: string) => translate(locale, key),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function resolveInitialLocaleFromDocument(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  return resolveLocale(document.documentElement.lang);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  const fallbackLocale = resolveInitialLocaleFromDocument();
  return (
    ctx ?? {
      locale: fallbackLocale,
      setLocale: () => {},
      t: (key: string) => translate(fallbackLocale, key),
    }
  );
}

