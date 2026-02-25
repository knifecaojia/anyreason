// lib/canvas/port-system.ts
// Port type system — color mapping, compatibility checking, and connection validation.

import type { PortDataType, PortDefinition } from './types';
import type { Node, Edge } from '@xyflow/react';
import type { NodeTypeRegistration } from './node-registry';

// ===== Port Color Mapping =====

export const PORT_COLORS: Record<PortDataType, string> = {
  'text': '#3b82f6',             // blue
  'image': '#a855f7',            // purple
  'video': '#22c55e',            // green
  'asset-ref': '#f97316',        // orange
  'storyboard-list': '#06b6d4',  // cyan
};

// ===== Port Compatibility =====

/**
 * Strict type matching: source must be output, target must be input,
 * and their dataType must be identical.
 */
export function arePortsCompatible(
  source: PortDefinition,
  target: PortDefinition,
): boolean {
  return (
    source.direction === 'output' &&
    target.direction === 'input' &&
    source.dataType === target.dataType
  );
}

// ===== Cycle Detection (inline BFS) =====

/**
 * Returns true if adding an edge from `source` to `target` would create a cycle.
 * Uses BFS from `target` along existing edges to see if `source` is reachable.
 */
function wouldCreateCycle(
  edges: Edge[],
  source: string,
  target: string,
): boolean {
  // If source === target, it's a self-loop → cycle
  if (source === target) return true;

  const visited = new Set<string>();
  const queue = [target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return true;
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

// ===== Connection Validation =====

export interface ConnectionValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether a proposed connection is allowed:
 * 1. Looks up source and target nodes
 * 2. Looks up their registrations from the registry
 * 3. Finds the source port (output) and target port (input) by handle ID
 * 4. Checks type compatibility via arePortsCompatible
 * 5. Checks for cycles via inline BFS
 */
export function validateConnection(
  connection: {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  },
  nodes: Node[],
  edges: Edge[],
  registry: Map<string, NodeTypeRegistration>,
): ConnectionValidationResult {
  // 1. Look up source and target nodes
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode) {
    return { valid: false, reason: 'Source node not found' };
  }
  if (!targetNode) {
    return { valid: false, reason: 'Target node not found' };
  }

  // 2. Look up registrations
  const sourceReg = registry.get(sourceNode.type as string);
  const targetReg = registry.get(targetNode.type as string);

  if (!sourceReg) {
    return { valid: false, reason: `Unknown source node type: ${sourceNode.type}` };
  }
  if (!targetReg) {
    return { valid: false, reason: `Unknown target node type: ${targetNode.type}` };
  }

  // 3. Find ports by handle ID
  const sourcePort = sourceReg.ports.find(
    (p) => p.id === connection.sourceHandle && p.direction === 'output',
  );
  const targetPort = targetReg.ports.find(
    (p) => p.id === connection.targetHandle && p.direction === 'input',
  );

  if (!sourcePort) {
    return {
      valid: false,
      reason: `Source output port "${connection.sourceHandle}" not found on ${sourceReg.type}`,
    };
  }
  if (!targetPort) {
    return {
      valid: false,
      reason: `Target input port "${connection.targetHandle}" not found on ${targetReg.type}`,
    };
  }

  // 4. Check type compatibility
  if (!arePortsCompatible(sourcePort, targetPort)) {
    return {
      valid: false,
      reason: `Incompatible port types: ${sourcePort.dataType} → ${targetPort.dataType}`,
    };
  }

  // 5. Check for cycles
  if (wouldCreateCycle(edges, connection.source, connection.target)) {
    return { valid: false, reason: 'Connection would create a cycle' };
  }

  return { valid: true };
}
