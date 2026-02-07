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
  const defaultMessage = "发生未知错误";
  if (!error || typeof error !== "object") return defaultMessage;

  const err = error as Record<string, unknown>;

  const axiosResponse = err.response as Record<string, unknown> | undefined;
  if (axiosResponse && typeof axiosResponse === "object") {
    const data = (axiosResponse as Record<string, unknown>)["data"];
    const axiosDetail = normalizeDetail((data as Record<string, unknown> | undefined)?.["detail"]);
    if (axiosDetail) return axiosDetail;
    if (typeof data === "string" && data.trim().length > 0) return data;
  }

  const direct = normalizeDetail(err.detail);
  if (direct) return direct;

  const wrapped = err.error as Record<string, unknown> | undefined;
  const wrappedDetail = normalizeDetail(wrapped?.detail);
  if (wrappedDetail) return wrappedDetail;

  const message = err.message;
  if (typeof message === "string" && message.trim().length > 0) {
    if (message.includes("ECONNREFUSED") || message.includes("connect") || message.includes("WinError 10061")) {
      return "无法连接后端 API（默认 http://localhost:8000）。请先启动 fastapi_backend，或设置 NEXT_PUBLIC_API_BASE_URL/API_BASE_URL。";
    }
    return message;
  }

  return defaultMessage;
}
