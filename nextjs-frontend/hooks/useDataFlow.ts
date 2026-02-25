'use client';

import { useCallback, useMemo } from 'react';
import type { Node, Edge, Connection } from '@xyflow/react';
import { topologySort, wouldCreateCycle, propagateData } from '../lib/canvas/data-flow';
import { validateConnection } from '../lib/canvas/port-system';
import { getAllNodeTypes } from '../lib/canvas/node-registry';

export interface UseDataFlowReturn {
  /** Validates a connection for type compatibility and cycle detection before allowing it. */
  onConnect: (connection: Connection) => boolean;
  /** Current topological order of node IDs. */
  topologyOrder: string[];
  /** Whether the current graph contains a cycle. */
  hasCycle: boolean;
  /** Propagate data from a source node's output port to downstream nodes. */
  propagate: (sourceNodeId: string, outputPortId: string, data: unknown) => void;
}

/**
 * Hook that wraps the data-flow engine: topologySort, wouldCreateCycle,
 * propagateData, and provides an onConnect validation callback.
 */
export function useDataFlow(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
): UseDataFlowReturn {
  const registry = useMemo(() => getAllNodeTypes(), []);

  const sortResult = useMemo(
    () => topologySort(nodes, edges),
    [nodes, edges],
  );

  const onConnect = useCallback(
    (connection: Connection): boolean => {
      const result = validateConnection(
        {
          source: connection.source ?? '',
          sourceHandle: connection.sourceHandle ?? '',
          target: connection.target ?? '',
          targetHandle: connection.targetHandle ?? '',
        },
        nodes,
        edges,
        registry,
      );
      return result.valid;
    },
    [nodes, edges, registry],
  );

  const propagate = useCallback(
    (sourceNodeId: string, outputPortId: string, data: unknown) => {
      propagateData(sourceNodeId, outputPortId, data, nodes, edges, setNodes);
    },
    [nodes, edges, setNodes],
  );

  return {
    onConnect,
    topologyOrder: sortResult.order,
    hasCycle: sortResult.hasCycle,
    propagate,
  };
}
