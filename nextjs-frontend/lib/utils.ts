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

function normalizeFastApiValidationErrors(detail: unknown): string | undefined {
  if (!Array.isArray(detail) || detail.length === 0) return undefined;
  if (!detail.every((x) => x && typeof x === "object")) return undefined;

  const parts: string[] = [];
  for (const item of detail as Array<Record<string, unknown>>) {
    const msg = typeof item["msg"] === "string" ? item["msg"] : "";
    const loc = Array.isArray(item["loc"]) ? (item["loc"] as unknown[]).map(String).join(".") : "";
    const s = [loc, msg].filter(Boolean).join(": ");
    if (s) parts.push(s);
  }
  return parts.length ? parts.join("；") : undefined;
}

function decodeUtf8Mojibake(value: string): string {
  if (!value) return value;
  const hasCjk = /[\u4e00-\u9fff]/.test(value);
  const looksLikeMojibake = !hasCjk && /[ÃÂåæçœ™]/.test(value);
  if (!looksLikeMojibake) return value;
  try {
    const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes("\uFFFD")) return decoded;
  } catch {
    return value;
  }
  return value;
}

export function getErrorMessage(error: unknown): string {
  const defaultMessage = "发生未知错误";
  if (typeof error === "string" && error.trim().length > 0) return decodeUtf8Mojibake(error);
  if (!error || typeof error !== "object") return defaultMessage;

  const err = error as Record<string, unknown>;

  const nestedErrors = err.errors;
  if (Array.isArray(nestedErrors) && nestedErrors.length > 0) {
    return getErrorMessage(nestedErrors[0]);
  }

  const cause = err.cause;
  if (cause && typeof cause === "object") {
    const causeMsg = (cause as Record<string, unknown>).message;
    if (typeof causeMsg === "string" && causeMsg.trim().length > 0) {
      return decodeUtf8Mojibake(causeMsg);
    }
  }

  const axiosResponse = err.response as Record<string, unknown> | undefined;
  if (axiosResponse && typeof axiosResponse === "object") {
    const status = axiosResponse["status"];
    const data = (axiosResponse as Record<string, unknown>)["data"];
    if (data && typeof data === "object") {
      const msg = (data as Record<string, unknown>)["msg"];
      const code = (data as Record<string, unknown>)["code"];
      if (typeof msg === "string" && msg.trim().length > 0) {
        if (msg.includes("database connection failed")) {
          return "服务暂时不可用，数据库连接失败，请稍后重试或联系管理员。";
        }
        // Map generic server errors to friendly Chinese messages
        if (status === 503 || code === 503) {
          return "服务暂时不可用，请稍后重试或联系管理员。";
        }
        if (status === 500 || code === 500) {
          return "服务器内部错误，请稍后重试。如持续出现请联系管理员。";
        }
        return decodeUtf8Mojibake(msg);
      }
    }
    const detail = (data as Record<string, unknown> | undefined)?.["detail"];
    const axiosDetail = normalizeDetail(detail) ?? normalizeFastApiValidationErrors(detail);
    if (axiosDetail) return decodeUtf8Mojibake(mapLoginDetail(axiosDetail));
    if (typeof data === "string" && data.trim().length > 0) return decodeUtf8Mojibake(data);
    if (typeof status === "number") {
      if (status === 503) return "服务暂时不可用，请稍后重试或联系管理员。";
      if (status === 500) return "服务器内部错误，请稍后重试。如持续出现请联系管理员。";
      return `请求失败（${status}）`;
    }
  }

  const direct = normalizeDetail(err.detail);
  if (direct) return decodeUtf8Mojibake(mapLoginDetail(direct));

  const wrapped = err.error as Record<string, unknown> | undefined;
  const wrappedDetail = normalizeDetail(wrapped?.detail);
  if (wrappedDetail) return decodeUtf8Mojibake(mapLoginDetail(wrappedDetail));

  const message = err.message;
  if (typeof message === "string" && message.trim().length > 0) {
    if (message.includes("ECONNREFUSED") || message.includes("connect") || message.includes("WinError 10061")) {
      return "无法连接后端 API（默认 http://127.0.0.1:8000）。请先启动 fastapi_backend，或设置 NEXT_PUBLIC_API_BASE_URL/API_BASE_URL。";
    }
    if (message.includes("status code 503")) {
      return "服务暂时不可用，数据库连接失败，请稍后重试或联系管理员。";
    }
    if (message.includes("status code 500")) {
      return "服务器内部错误，请稍后重试。如持续出现请联系管理员。";
    }
    return decodeUtf8Mojibake(message);
  }

  return decodeUtf8Mojibake(defaultMessage);
}

function mapLoginDetail(detail: string): string {
  if (detail === "LOGIN_BAD_CREDENTIALS") return "用户名或密码错误";
  if (detail === "LOGIN_USER_NOT_VERIFIED") return "账号未验证";
  if (detail === "LOGIN_USER_INACTIVE") return "账号已停用";
  return detail;
}
