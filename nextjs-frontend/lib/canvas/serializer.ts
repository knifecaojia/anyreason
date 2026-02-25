import type { Node, Edge } from '@xyflow/react';
import type {
  WorkflowSnapshot,
  SerializedNode,
  SerializedEdge,
  PortDataType,
} from './types';

/** Current snapshot format version */
export const CURRENT_VERSION = 2;

const VALID_NODE_TYPES = new Set([
  'textNoteNode',
  'mediaNode',
  'assetNode',
  'referenceNode',
  'scriptNode',
  'generatorNode',
  'previewNode',
  'slicerNode',
  'candidateNode',
  'storyboardNode',
]);

const VALID_PORT_TYPES = new Set<string>([
  'text',
  'image',
  'video',
  'asset-ref',
  'storyboard-list',
]);

// ===== serializeCanvas =====

export function serializeCanvas(
  canvasId: string,
  nodes: Node[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number }
): WorkflowSnapshot {
  const serializedNodes: SerializedNode[] = nodes.map((node) => {
    const serialized: SerializedNode = {
      id: node.id,
      type: node.type ?? 'textNoteNode',
      position: { x: node.position.x, y: node.position.y },
      data: { ...(node.data as Record<string, unknown>) },
    };
    const data = node.data as Record<string, unknown> | undefined;
    if (data && typeof data.collapsed === 'boolean') {
      serialized.collapsed = data.collapsed;
    }
    return serialized;
  });

  const serializedEdges: SerializedEdge[] = edges.map((edge) => {
    const serialized: SerializedEdge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
    };
    if (edge.sourceHandle) serialized.sourceHandle = edge.sourceHandle;
    if (edge.targetHandle) serialized.targetHandle = edge.targetHandle;
    const edgeData = (edge as unknown as { data?: Record<string, unknown> }).data;
    if (edgeData && edgeData.portType) {
      serialized.data = { portType: edgeData.portType as PortDataType };
    }
    return serialized;
  });

  return {
    version: CURRENT_VERSION,
    canvasId,
    reactflow: {
      nodes: serializedNodes,
      edges: serializedEdges,
      viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    },
    updatedAt: new Date().toISOString(),
  };
}


// ===== Validation helpers =====

function validateSnapshot(obj: unknown): string[] {
  const errors: string[] = [];

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    errors.push('Root must be a non-null object');
    return errors;
  }

  const root = obj as Record<string, unknown>;

  // Required top-level fields
  if (!Number.isInteger(root.version) || (root.version as number) < 1) {
    errors.push('version must be an integer >= 1');
  }
  if (typeof root.canvasId !== 'string' || (root.canvasId as string).length === 0) {
    errors.push('canvasId must be a non-empty string');
  }
  if (typeof root.updatedAt !== 'string') {
    errors.push('updatedAt must be a string');
  }

  if (typeof root.reactflow !== 'object' || root.reactflow === null || Array.isArray(root.reactflow)) {
    errors.push('reactflow must be a non-null object');
    return errors;
  }

  const rf = root.reactflow as Record<string, unknown>;

  // Validate nodes
  if (!Array.isArray(rf.nodes)) {
    errors.push('reactflow.nodes must be an array');
  } else {
    (rf.nodes as unknown[]).forEach((node, i) => {
      errors.push(...validateNode(node, i));
    });
  }

  // Validate edges
  if (!Array.isArray(rf.edges)) {
    errors.push('reactflow.edges must be an array');
  } else {
    (rf.edges as unknown[]).forEach((edge, i) => {
      errors.push(...validateEdge(edge, i));
    });
  }

  // Validate viewport
  if (typeof rf.viewport !== 'object' || rf.viewport === null || Array.isArray(rf.viewport)) {
    errors.push('reactflow.viewport must be a non-null object');
  } else {
    const vp = rf.viewport as Record<string, unknown>;
    if (typeof vp.x !== 'number') errors.push('reactflow.viewport.x must be a number');
    if (typeof vp.y !== 'number') errors.push('reactflow.viewport.y must be a number');
    if (typeof vp.zoom !== 'number' || (vp.zoom as number) <= 0) {
      errors.push('reactflow.viewport.zoom must be a number > 0');
    }
  }

  return errors;
}

function validateNode(node: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `reactflow.nodes[${index}]`;

  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    errors.push(`${prefix} must be a non-null object`);
    return errors;
  }

  const n = node as Record<string, unknown>;

  if (typeof n.id !== 'string') errors.push(`${prefix}.id must be a string`);
  if (typeof n.type !== 'string' || !VALID_NODE_TYPES.has(n.type as string)) {
    errors.push(`${prefix}.type must be one of: ${[...VALID_NODE_TYPES].join(', ')}`);
  }

  if (typeof n.position !== 'object' || n.position === null || Array.isArray(n.position)) {
    errors.push(`${prefix}.position must be a non-null object`);
  } else {
    const pos = n.position as Record<string, unknown>;
    if (typeof pos.x !== 'number') errors.push(`${prefix}.position.x must be a number`);
    if (typeof pos.y !== 'number') errors.push(`${prefix}.position.y must be a number`);
  }

  if (typeof n.data !== 'object' || n.data === null || Array.isArray(n.data)) {
    errors.push(`${prefix}.data must be a non-null object`);
  }

  if (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') {
    errors.push(`${prefix}.collapsed must be a boolean if present`);
  }

  return errors;
}

function validateEdge(edge: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `reactflow.edges[${index}]`;

  if (typeof edge !== 'object' || edge === null || Array.isArray(edge)) {
    errors.push(`${prefix} must be a non-null object`);
    return errors;
  }

  const e = edge as Record<string, unknown>;

  if (typeof e.id !== 'string') errors.push(`${prefix}.id must be a string`);
  if (typeof e.source !== 'string') errors.push(`${prefix}.source must be a string`);
  if (typeof e.target !== 'string') errors.push(`${prefix}.target must be a string`);

  if (e.sourceHandle !== undefined && typeof e.sourceHandle !== 'string') {
    errors.push(`${prefix}.sourceHandle must be a string if present`);
  }
  if (e.targetHandle !== undefined && typeof e.targetHandle !== 'string') {
    errors.push(`${prefix}.targetHandle must be a string if present`);
  }

  if (e.data !== undefined) {
    if (typeof e.data !== 'object' || e.data === null || Array.isArray(e.data)) {
      errors.push(`${prefix}.data must be a non-null object if present`);
    } else {
      const data = e.data as Record<string, unknown>;
      if (data.portType !== undefined && (typeof data.portType !== 'string' || !VALID_PORT_TYPES.has(data.portType as string))) {
        errors.push(`${prefix}.data.portType must be one of: ${[...VALID_PORT_TYPES].join(', ')}`);
      }
    }
  }

  return errors;
}

// ===== deserializeCanvas =====

export function deserializeCanvas(
  json: string
): { success: true; snapshot: WorkflowSnapshot } | { success: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, errors: ['Invalid JSON: failed to parse input'] };
  }

  const errors = validateSnapshot(parsed);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, snapshot: parsed as WorkflowSnapshot };
}

// ===== migrateSnapshot =====

export function migrateSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  if (snapshot.version >= CURRENT_VERSION) {
    return snapshot;
  }

  // Deep clone to avoid mutating the original
  const migrated: WorkflowSnapshot = JSON.parse(JSON.stringify(snapshot));

  // v1 → v2: add collapsed defaults and portType to edges
  if (migrated.version < 2) {
    migrated.reactflow.nodes = migrated.reactflow.nodes.map((node) => ({
      ...node,
      collapsed: node.collapsed ?? false,
    }));

    migrated.reactflow.edges = migrated.reactflow.edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        portType: edge.data?.portType ?? ('text' as PortDataType),
      },
    }));

    migrated.version = 2;
  }

  return migrated;
}

// ===== exportToFile =====

export function exportToFile(snapshot: WorkflowSnapshot, filename?: string): string {
  const jsonStr = JSON.stringify(snapshot, null, 2);

  // Browser environment: trigger download
  if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `workflow-${snapshot.canvasId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return jsonStr;
}

// ===== exportSelectedNodes =====

export function exportSelectedNodes(
  selectedNodeIds: string[],
  nodes: Node[],
  edges: Edge[],
  canvasId: string
): WorkflowSnapshot {
  const selectedSet = new Set(selectedNodeIds);

  const filteredNodes = nodes.filter((n) => selectedSet.has(n.id));
  const filteredEdges = edges.filter(
    (e) => selectedSet.has(e.source) && selectedSet.has(e.target)
  );

  return serializeCanvas(canvasId, filteredNodes, filteredEdges, { x: 0, y: 0, zoom: 1 });
}

// ===== importFromFile =====

export function importFromFile(
  file: File
): Promise<{ success: true; snapshot: WorkflowSnapshot } | { success: false; errors: string[] }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(deserializeCanvas(text));
    };
    reader.onerror = () => {
      resolve({ success: false, errors: ['Failed to read file'] });
    };
    reader.readAsText(file);
  });
}
