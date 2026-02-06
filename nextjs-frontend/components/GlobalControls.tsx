"use client";

import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function GlobalControls() {
  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur">
      <LocaleSwitcher />
      <ThemeToggle />
    </div>
  );
}

