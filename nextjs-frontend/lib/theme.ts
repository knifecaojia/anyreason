export type Theme = "light" | "dark";

export const defaultTheme: Theme = "dark";

export function resolveTheme(input: string | undefined | null): Theme {
  if (!input) return defaultTheme;
  const lower = input.trim().toLowerCase();
  if (lower === "dark") return "dark";
  return "light";
}
