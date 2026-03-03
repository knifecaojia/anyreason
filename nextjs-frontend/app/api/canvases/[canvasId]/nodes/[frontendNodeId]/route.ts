import { proxyToBackend } from "../../../_proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ canvasId: string; frontendNodeId: string }> },
) {
  const { canvasId, frontendNodeId } = await params;
  return proxyToBackend(
    request,
    `/api/v1/canvases/${canvasId}/nodes/${encodeURIComponent(frontendNodeId)}`,
  );
}
