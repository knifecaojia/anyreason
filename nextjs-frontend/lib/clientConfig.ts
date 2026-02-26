import { client } from "@/app/openapi-client/client.gen";

const useMockApi =
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true" || process.env.USE_MOCK_API === "true";

const configureClient = () => {
  if (useMockApi) return;

  const isBrowser = typeof window !== "undefined";

  let baseURL: string | undefined;

  if (isBrowser) {
    // 浏览器端：使用相对路径，请求自动走当前页面的 origin（经 nginx 代理）
    // 这样无论 HTTP 还是 HTTPS 都不会出现 Mixed Content 问题
    baseURL = "";
  } else {
    // 服务端（SSR）：使用内部网络地址直连后端
    baseURL =
      process.env.INTERNAL_API_BASE_URL ||
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : undefined);

    if (!baseURL) {
      throw new Error(
        "API base URL is not configured. Set INTERNAL_API_BASE_URL or API_BASE_URL (server).",
      );
    }
  }

  client.setConfig({
    baseURL: baseURL,
  });
};

configureClient();
