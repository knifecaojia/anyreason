import { proxyToBackend } from "../../_proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  return proxyToBackend(request, `/api/v1/canvases/${canvasId}/export`);
}
