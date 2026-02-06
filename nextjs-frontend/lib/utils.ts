import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function normalizeDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (!detail || typeof detail !== "object") return undefined;

  const reason = (detail as Record<string, unknown>)["reason"];
  if (typeof reason === "string") return reason;
  if (Array.isArray(reason) && reason.every((x) => typeof x === "string")) {
    return reason.join(" ");
  }

  return undefined;
}

export function getErrorMessage(error: unknown): string {
  const defaultMessage = "An unknown error occurred";
  if (!error || typeof error !== "object") return defaultMessage;

  const err = error as Record<string, unknown>;

  const direct = normalizeDetail(err.detail);
  if (direct) return direct;

  const wrapped = err.error as Record<string, unknown> | undefined;
  const wrappedDetail = normalizeDetail(wrapped?.detail);
  if (wrappedDetail) return wrappedDetail;

  const message = err.message;
  if (typeof message === "string" && message.trim().length > 0) return message;

  return defaultMessage;
}
