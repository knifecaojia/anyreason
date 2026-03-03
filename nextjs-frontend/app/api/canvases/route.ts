import { proxyToBackend } from "./_proxy";

export async function GET(request: Request) {
  return proxyToBackend(request, "/api/v1/canvases");
}

export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/canvases");
}
