"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Locale, supportedLocales } from "@/lib/i18n";
import { useI18n } from "@/components/i18n/LocaleProvider";

const labels: Record<Locale, string> = {
  "en-US": "English",
  "zh-CN": "中文",
};

export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Language">
          <Languages className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">{labels[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        {supportedLocales.map((item) => (
          <DropdownMenuItem key={item} onSelect={() => setLocale(item)}>
            {labels[item]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

