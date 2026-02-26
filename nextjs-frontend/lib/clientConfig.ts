import { client } from "@/app/openapi-client/client.gen";

const useMockApi =
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true" || process.env.USE_MOCK_API === "true";

const configureClient = () => {
  if (useMockApi) return;

  const baseURL =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : undefined);

  if (!baseURL) {
    throw new Error(
      "API base URL is not configured. Set INTERNAL_API_BASE_URL or API_BASE_URL (server) and optionally NEXT_PUBLIC_API_BASE_URL (client).",
    );
  }

  client.setConfig({
    baseURL: baseURL,
  });
};

configureClient();
