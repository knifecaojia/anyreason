/**
 * Server-side API base URL resolver for Next.js SSR/route handlers/server actions.
 *
 * Priority order:
 * 1. INTERNAL_API_BASE_URL - internal network address (preferred for server-to-server)
 * 2. API_BASE_URL - server-side only config
 * 3. NEXT_PUBLIC_API_BASE_URL - public config (fallback)
 * 4. Development fallback: http://127.0.0.1:8000 (only when NODE_ENV === "development")
 *
 * This module is server-only and should NOT be imported in client components.
 */

function getApiBaseUrl(): string {
  const baseURL =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (baseURL) {
    return baseURL;
  }

  // Development fallback - only in development mode
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }

  // Production: throw error if no base URL is configured
  throw new Error(
    "API base URL is not configured. Set INTERNAL_API_BASE_URL, API_BASE_URL, or NEXT_PUBLIC_API_BASE_URL (server-side).",
  );
}

/**
 * Returns the API base URL for server-side requests.
 * Use this in route handlers and server actions.
 *
 * @throws Error in production when no API base URL is configured
 */
export const serverApiBase = getApiBaseUrl();

/**
 * Get the API base URL as a function call (useful for lazy evaluation).
 * Throws error in production if not configured.
 */
export function getServerApiBaseUrl(): string {
  return getApiBaseUrl();
}

export default getApiBaseUrl;
