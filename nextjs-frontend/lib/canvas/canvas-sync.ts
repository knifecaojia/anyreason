/**
 * Canvas VFS→DB Sync Service — M2.5
 *
 * One-way sync: VFS JSON is Source of Truth, DB is a mirror for queries/permissions.
 * All sync operations are fire-and-forget (errors are logged, never block UI).
 *
 * 5 sync rules:
 * 1. Node added    → upsert CanvasNode record
 * 2. Node deleted  → delete CanvasNode record
 * 3. Node executed → update CanvasNode.status, last_task_id, output_file_node_id
 * 4. Canvas saved  → update Canvas.node_count, updated_at (via PATCH)
 * 5. Upsert is idempotent via UNIQUE(canvas_id, frontend_node_id)
 */

const API_BASE = '/api/canvases';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncNodePayload {
  frontend_node_id: string;
  node_type: string;
  source_storyboard_id?: string | null;
  source_asset_id?: string | null;
  config_json?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Low-level API calls (fire-and-forget safe)
// ---------------------------------------------------------------------------

async function apiCall(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[canvas-sync] ${init?.method ?? 'GET'} ${url} → ${res.status}`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[canvas-sync] network error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rule 1+5: Batch upsert nodes (idempotent via UNIQUE constraint)
// ---------------------------------------------------------------------------

export async function syncNodes(
  canvasId: string,
  nodes: SyncNodePayload[],
): Promise<boolean> {
  if (!canvasId || nodes.length === 0) return true;
  return apiCall(`${API_BASE}/${canvasId}/nodes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(nodes),
  });
}

// ---------------------------------------------------------------------------
// Rule 2: Delete a single node
// ---------------------------------------------------------------------------

export async function syncDeleteNode(
  canvasId: string,
  frontendNodeId: string,
): Promise<boolean> {
  if (!canvasId || !frontendNodeId) return true;
  return apiCall(
    `${API_BASE}/${canvasId}/nodes/${encodeURIComponent(frontendNodeId)}`,
    { method: 'DELETE' },
  );
}

// ---------------------------------------------------------------------------
// Rule 4: Update canvas metadata after save
// ---------------------------------------------------------------------------

export async function syncCanvasSaved(
  canvasId: string,
  patch: { name?: string; node_count?: number },
): Promise<boolean> {
  if (!canvasId) return true;
  return apiCall(`${API_BASE}/${canvasId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ---------------------------------------------------------------------------
// Rule 3: Node execution completed
// ---------------------------------------------------------------------------

export async function syncNodeExecutionResult(
  canvasId: string,
  frontendNodeId: string,
  nodeType: string,
  result: {
    status: 'completed' | 'failed';
    last_task_id?: string | null;
    output_file_node_id?: string | null;
  },
): Promise<boolean> {
  if (!canvasId || !frontendNodeId) return true;
  return apiCall(`${API_BASE}/${canvasId}/nodes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{
      frontend_node_id: frontendNodeId,
      node_type: nodeType,
      config_json: {
        _sync_status: result.status,
        _sync_last_task_id: result.last_task_id ?? null,
        _sync_output_file_node_id: result.output_file_node_id ?? null,
      },
    }]),
  });
}

// ---------------------------------------------------------------------------
// Convenience: Full sync from ReactFlow nodes (called after VFS save)
// ---------------------------------------------------------------------------

export function buildSyncPayloads(
  rfNodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
): SyncNodePayload[] {
  return rfNodes.map((n) => ({
    frontend_node_id: n.id,
    node_type: n.type ?? 'unknown',
    source_storyboard_id: (n.data?.sourceStoryboardId as string) ?? null,
    source_asset_id: (n.data?.sourceAssetId as string) ?? null,
    config_json: {},
  }));
}

/**
 * Full sync: upsert all current nodes + update canvas metadata.
 * Called after each VFS save to keep DB in sync.
 */
export async function syncAfterSave(
  canvasId: string,
  canvasName: string,
  rfNodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
): Promise<void> {
  const payloads = buildSyncPayloads(rfNodes);
  // Fire both in parallel — both are fire-and-forget
  await Promise.all([
    syncNodes(canvasId, payloads),
    syncCanvasSaved(canvasId, { name: canvasName, node_count: rfNodes.length }),
  ]);
}

// ---------------------------------------------------------------------------
// M4.4: Canvas thumbnail upload
// ---------------------------------------------------------------------------

/**
 * Upload a base64-encoded thumbnail image for the canvas.
 * Fire-and-forget — errors are logged, never block UI.
 */
export async function uploadCanvasThumbnail(
  canvasId: string,
  imageBase64: string,
  contentType: string = 'image/png',
): Promise<boolean> {
  if (!canvasId || !imageBase64) return false;
  return apiCall(`${API_BASE}/${canvasId}/thumbnail`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, content_type: contentType }),
  });
}

// ---------------------------------------------------------------------------
// M3.4: Startup sync validation
// ---------------------------------------------------------------------------

interface DbCanvasNode {
  id: string;
  frontend_node_id: string;
  node_type: string;
}

/**
 * Compare VFS JSON nodes with DB CanvasNode records.
 * Upserts missing nodes and deletes stale DB-only nodes.
 * Called once when the canvas editor mounts.
 *
 * Returns true if any repair was performed.
 */
export async function startupSyncValidation(
  canvasId: string,
  rfNodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
): Promise<boolean> {
  if (!canvasId || rfNodes.length === 0) return false;

  try {
    // Fetch current DB nodes
    const res = await fetch(`${API_BASE}/${canvasId}/nodes`, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('[canvas-sync] startup validation: failed to fetch DB nodes', res.status);
      return false;
    }
    const json = (await res.json()) as { data?: DbCanvasNode[] };
    const dbNodes = json.data ?? [];

    const dbNodeIds = new Set(dbNodes.map((n) => n.frontend_node_id));
    const vfsNodeIds = new Set(rfNodes.map((n) => n.id));

    // Nodes in VFS but not in DB → need upsert
    const missingInDb = rfNodes.filter((n) => !dbNodeIds.has(n.id));

    // Nodes in DB but not in VFS → stale, need delete
    const staleInDb = dbNodes.filter((n) => !vfsNodeIds.has(n.frontend_node_id));

    if (missingInDb.length === 0 && staleInDb.length === 0) {
      return false; // No drift
    }

    console.info(
      `[canvas-sync] startup drift detected: ${missingInDb.length} missing in DB, ${staleInDb.length} stale in DB`,
    );

    // Repair: upsert missing nodes
    if (missingInDb.length > 0) {
      const payloads = buildSyncPayloads(missingInDb);
      await syncNodes(canvasId, payloads);
    }

    // Repair: delete stale nodes
    for (const stale of staleInDb) {
      await syncDeleteNode(canvasId, stale.frontend_node_id);
    }

    // Update canvas node_count
    await syncCanvasSaved(canvasId, { node_count: rfNodes.length });

    return true;
  } catch (err) {
    console.warn('[canvas-sync] startup validation error:', err);
    return false;
  }
}
