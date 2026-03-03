import { proxyToBackend } from "../../_proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  return proxyToBackend(request, `/api/v1/canvases/${canvasId}/nodes`);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  return proxyToBackend(request, `/api/v1/canvases/${canvasId}/nodes`);
}
