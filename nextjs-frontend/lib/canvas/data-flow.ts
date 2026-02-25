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

// ===== Data Propagation =====

/**
 * Propagates data from a source node's output port to all directly connected
 * downstream nodes, then recursively propagates to their downstream nodes.
 *
 * For each edge from sourceNodeId with matching sourceHandle, updates the
 * target node's data with the propagated value keyed by the targetHandle.
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

  // Collect target node IDs and their target handles
  const targets = outEdges.map((e) => ({
    nodeId: e.target,
    targetHandle: e.targetHandle,
  }));

  // Update target nodes' data
  setNodes((currentNodes) =>
    currentNodes.map((node) => {
      const target = targets.find((t) => t.nodeId === node.id);
      if (!target) return node;

      const existingData =
        typeof node.data === 'object' && node.data !== null ? node.data : {};
      return {
        ...node,
        data: {
          ...existingData,
          [target.targetHandle ?? 'input']: data,
        },
      };
    }),
  );

  // Recursively propagate to downstream nodes
  for (const target of targets) {
    // Find output edges from the target node to continue propagation
    const targetOutEdges = edges.filter((e) => e.source === target.nodeId);
    const targetOutHandles = new Set(targetOutEdges.map((e) => e.sourceHandle));

    for (const handle of targetOutHandles) {
      if (handle) {
        propagateData(target.nodeId, handle, data, nodes, edges, setNodes);
      }
    }
  }
}
