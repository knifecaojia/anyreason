// lib/canvas/data-flow.ts
// Data flow engine — topology sort (Kahn's algorithm), cycle detection, downstream traversal, and data propagation.

import type { Node, Edge } from '@xyflow/react';

// ===== Types =====

export interface TopologySortResult {
  order: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

// ===== Kahn's Algorithm Topology Sort + Cycle Detection =====

/**
 * Performs topological sort on the graph defined by nodes and edges using Kahn's algorithm.
 * Also detects cycles: if the sorted order doesn't include all nodes, a cycle exists.
 */
export function topologySort(nodes: Node[], edges: Edge[]): TopologySortResult {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Build adjacency list and in-degree counts
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  // BFS from nodes with in-degree 0
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // If order doesn't include all nodes, there's a cycle
  const hasCycle = order.length < nodeIds.size;
  const cycleNodes = hasCycle
    ? [...nodeIds].filter((id) => !order.includes(id))
    : undefined;

  return { order, hasCycle, cycleNodes };
}

// ===== Cycle Detection for Single Edge Addition =====

/**
 * Checks whether adding a new edge would create a cycle in the graph.
 * Uses BFS from newEdge.target along existing edges to see if newEdge.source is reachable.
 */
export function wouldCreateCycle(
  edges: Edge[],
  newEdge: { source: string; target: string },
): boolean {
  // Self-loop is always a cycle
  if (newEdge.source === newEdge.target) return true;

  const visited = new Set<string>();
  const queue = [newEdge.target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === newEdge.source) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return false;
}

// ===== Downstream Node Traversal =====

/**
 * Returns all downstream node IDs reachable from the given nodeId via BFS.
 * Does not include the starting nodeId itself.
 */
export function getDownstreamNodes(nodeId: string, edges: Edge[]): string[] {
  const visited = new Set<string>();
  const queue: string[] = [];

  // Seed with direct successors
  for (const edge of edges) {
    if (edge.source === nodeId && !visited.has(edge.target)) {
      queue.push(edge.target);
      visited.add(edge.target);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return [...visited];
}

// ===== Multi-Source Input Merge =====

/**
 * Infers the port data type from a targetHandle id.
 * Convention: handles named `in-text`, `in-image`, `in-asset`, etc.
 * Falls back to edge.data.portType if available.
 */
function inferPortType(
  targetHandle: string | null | undefined,
  edge?: Edge,
): 'text' | 'image' | 'asset-ref' | 'unknown' {
  const edgePortType = (edge as unknown as { data?: Record<string, unknown> })?.data?.portType;
  if (typeof edgePortType === 'string') {
    if (edgePortType === 'text') return 'text';
    if (edgePortType === 'image') return 'image';
    if (edgePortType === 'asset-ref') return 'asset-ref';
  }
  if (!targetHandle) return 'unknown';
  const h = targetHandle.toLowerCase();
  if (h.includes('text') || h.includes('script') || h.includes('desc')) return 'text';
  if (h.includes('image') || h.includes('img')) return 'image';
  if (h.includes('asset') || h.includes('ref')) return 'asset-ref';
  return 'unknown';
}

/**
 * Merges multiple upstream values arriving at the same input port,
 * according to the port's data type:
 *
 * - **text**: concatenate with `\n\n---\n\n` separator
 * - **asset-ref**: merge into array, deduplicate by `assetId`
 * - **image**: take the last value (most recently connected)
 * - **unknown/other**: last-write-wins (backwards-compatible)
 */
export function mergeInputs(
  values: unknown[],
  portType: 'text' | 'image' | 'asset-ref' | 'unknown',
): unknown {
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];

  switch (portType) {
    case 'text': {
      const texts = values
        .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
        .filter((t) => t.length > 0);
      return texts.join('\n\n---\n\n');
    }
    case 'asset-ref': {
      const seen = new Set<string>();
      const merged: unknown[] = [];
      for (const v of values) {
        const arr = Array.isArray(v) ? v : [v];
        for (const item of arr) {
          const id =
            typeof item === 'object' && item !== null
              ? (item as Record<string, unknown>).assetId ?? (item as Record<string, unknown>).id
              : item;
          const key = String(id ?? '');
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
      }
      return merged;
    }
    case 'image': {
      return values[values.length - 1];
    }
    default: {
      return values[values.length - 1];
    }
  }
}

// ===== Data Propagation =====

/**
 * Propagates data from a source node's output port to all directly connected
 * downstream nodes, then recursively propagates to their downstream nodes.
 *
 * Multi-source merge: when multiple edges target the same (nodeId, targetHandle),
 * all upstream values are collected and merged according to the port data type
 * (see `mergeInputs`).
 */
export function propagateData(
  sourceNodeId: string,
  outputPortId: string,
  data: unknown,
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
): void {
  // Find edges from sourceNodeId with matching sourceHandle
  const outEdges = edges.filter(
    (e) => e.source === sourceNodeId && e.sourceHandle === outputPortId,
  );

  if (outEdges.length === 0) return;

  // Group targets by (nodeId, targetHandle) for multi-source merge
  const targetMap = new Map<string, { nodeId: string; targetHandle: string; portType: ReturnType<typeof inferPortType>; values: unknown[] }>();

  for (const edge of outEdges) {
    const key = `${edge.target}::${edge.targetHandle ?? 'input'}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, {
        nodeId: edge.target,
        targetHandle: edge.targetHandle ?? 'input',
        portType: inferPortType(edge.targetHandle, edge),
        values: [],
      });
    }
    targetMap.get(key)!.values.push(data);
  }

  // Also collect values from OTHER edges targeting the same (nodeId, targetHandle)
  // that are NOT from this source — needed for correct multi-source merge
  for (const [key, target] of targetMap) {
    const allIncoming = edges.filter(
      (e) =>
        e.target === target.nodeId &&
        (e.targetHandle ?? 'input') === target.targetHandle &&
        e.source !== sourceNodeId,
    );
    for (const inEdge of allIncoming) {
      // Read the value currently stored from other sources
      const srcNode = nodes.find((n) => n.id === inEdge.source);
      if (srcNode) {
        const srcData = srcNode.data as Record<string, unknown> | undefined;
        const srcHandle = inEdge.sourceHandle;
        // Try to read the output value from the source node
        if (srcData && srcHandle && srcData[srcHandle] !== undefined) {
          target.values.unshift(srcData[srcHandle]);
        }
      }
    }
  }

  // Update target nodes' data with merged values
  setNodes((currentNodes) =>
    currentNodes.map((node) => {
      const entries = [...targetMap.values()].filter((t) => t.nodeId === node.id);
      if (entries.length === 0) return node;

      const existingData =
        typeof node.data === 'object' && node.data !== null ? node.data : {};
      const updates: Record<string, unknown> = {};

      for (const entry of entries) {
        updates[entry.targetHandle] = mergeInputs(entry.values, entry.portType);
      }

      return {
        ...node,
        data: {
          ...existingData,
          ...updates,
        },
      };
    }),
  );

  // Recursively propagate to downstream nodes
  const propagatedNodeIds = new Set<string>();
  for (const target of targetMap.values()) {
    if (propagatedNodeIds.has(target.nodeId)) continue;
    propagatedNodeIds.add(target.nodeId);

    const targetOutEdges = edges.filter((e) => e.source === target.nodeId);
    const targetOutHandles = new Set(targetOutEdges.map((e) => e.sourceHandle));

    for (const handle of targetOutHandles) {
      if (handle) {
        propagateData(target.nodeId, handle, data, nodes, edges, setNodes);
      }
    }
  }
}
