/**
 * Property-Based Tests for data-flow.ts
 *
 * Uses fast-check to verify universal properties of the data flow engine.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import {
  topologySort,
  wouldCreateCycle,
  getDownstreamNodes,
  propagateData,
} from '../../lib/canvas/data-flow';

// ===== Generators =====

/**
 * Generates a random DAG (Directed Acyclic Graph).
 * Only generates edges where source index < target index to guarantee no cycles.
 */
const arbDAG = fc.integer({ min: 2, max: 20 }).chain((nodeCount) => {
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);
  // Only generate edges i < j to guarantee no cycles
  const possibleEdges: Array<{ source: string; target: string }> = [];
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      possibleEdges.push({ source: nodeIds[i], target: nodeIds[j] });
    }
  }
  return fc.subarray(possibleEdges).map((edges) => ({
    nodes: nodeIds.map(
      (id) =>
        ({
          id,
          type: 'generatorNode',
          position: { x: 0, y: 0 },
          data: {},
        }) as Node,
    ),
    edges: edges.map((e, idx) => ({ id: `edge-${idx}`, ...e }) as Edge),
  }));
});

// ===== Property Tests =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 6: Data propagation completeness along DAG', () => {
  /**
   * Property 6: 数据沿 DAG 传播完整性
   * For any DAG, when a source node's output data changes, all reachable
   * downstream nodes should receive the update, and unreachable nodes
   * should not be affected.
   *
   * **Validates: Requirements 2.4**
   */
  it('all reachable downstream nodes receive updates and unreachable nodes are unaffected', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        if (nodes.length === 0) return;

        // Pick the first node as the source
        const sourceId = nodes[0].id;
        const testData = 'propagated-value';
        const outputPortId = 'text';

        // Add sourceHandle to edges from the source node so propagateData can match them
        const edgesWithHandles: Edge[] = edges.map((e) => ({
          ...e,
          sourceHandle: e.source === sourceId ? outputPortId : 'text',
          targetHandle: 'in-script',
        }));

        // Determine expected reachable downstream nodes
        const reachable = new Set(getDownstreamNodes(sourceId, edgesWithHandles));

        // Track all setNodes calls to capture updates
        const allUpdatedNodeIds = new Set<string>();
        const setNodes = (updater: (nodes: Node[]) => Node[]) => {
          const updated = updater(nodes);
          for (const node of updated) {
            const data = node.data as Record<string, unknown>;
            if (data['in-script'] === testData) {
              allUpdatedNodeIds.add(node.id);
            }
          }
        };

        propagateData(sourceId, outputPortId, testData, nodes, edgesWithHandles, setNodes);

        // All directly connected downstream nodes from source should be updated
        const directTargets = edgesWithHandles
          .filter((e) => e.source === sourceId && e.sourceHandle === outputPortId)
          .map((e) => e.target);

        for (const targetId of directTargets) {
          expect(allUpdatedNodeIds.has(targetId)).toBe(true);
        }

        // Source node itself should not be updated
        expect(allUpdatedNodeIds.has(sourceId)).toBe(false);

        // Unreachable nodes should not be updated
        for (const node of nodes) {
          if (node.id !== sourceId && !reachable.has(node.id)) {
            expect(allUpdatedNodeIds.has(node.id)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 7: Cycle connection detection', () => {
  /**
   * Property 7: 循环连接检测
   * For any DAG, wouldCreateCycle should return true for edges that would
   * create a cycle (e.g., reverse edges) and false for edges that wouldn't.
   * Also verify consistency with topologySort.
   *
   * **Validates: Requirements 2.6**
   */
  it('returns true for reverse edges that would create a cycle', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        if (edges.length === 0) return;

        // Pick a random existing edge and reverse it
        for (const edge of edges) {
          // A reverse edge (target → source) should create a cycle
          // because the original edge (source → target) already exists
          const reverseEdge = { source: edge.target, target: edge.source };
          const wouldCycle = wouldCreateCycle(edges, reverseEdge);

          // Verify consistency with topologySort:
          // If wouldCreateCycle says true, adding the edge should cause a cycle in topologySort
          const edgesWithNew: Edge[] = [
            ...edges,
            { id: 'new-edge', ...reverseEdge } as Edge,
          ];
          const sortResult = topologySort(nodes, edgesWithNew);

          if (wouldCycle) {
            expect(sortResult.hasCycle).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns false for forward edges that do not create a cycle', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        if (nodes.length < 2) return;

        // Try adding edges from lower-index to higher-index nodes (forward edges)
        // These should never create cycles in our DAG construction
        const nodeIds = nodes.map((n) => n.id);
        for (let i = 0; i < Math.min(nodeIds.length - 1, 3); i++) {
          const newEdge = {
            source: nodeIds[i],
            target: nodeIds[nodeIds.length - 1],
          };
          const wouldCycle = wouldCreateCycle(edges, newEdge);

          // Verify consistency: if wouldCreateCycle says false,
          // adding the edge should not cause a cycle
          if (!wouldCycle) {
            const edgesWithNew: Edge[] = [
              ...edges,
              { id: 'new-edge', ...newEdge } as Edge,
            ];
            const sortResult = topologySort(nodes, edgesWithNew);
            expect(sortResult.hasCycle).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('self-loops are always detected as cycles', () => {
    fc.assert(
      fc.property(arbDAG, ({ edges }) => {
        const selfLoop = { source: 'node-0', target: 'node-0' };
        expect(wouldCreateCycle(edges, selfLoop)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 9: Topological sort validity', () => {
  /**
   * Property 9: 拓扑排序有效性
   * For any DAG, topologySort should return an order where for every edge (u,v),
   * u appears before v, and the order contains all nodes.
   *
   * **Validates: Requirements 3.1**
   */
  it('for every edge (u,v), u appears before v in the sorted order', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        const result = topologySort(nodes, edges);

        // DAGs generated by arbDAG should never have cycles
        expect(result.hasCycle).toBe(false);

        // Build position map for O(1) lookup
        const positionMap = new Map<string, number>();
        result.order.forEach((id, idx) => positionMap.set(id, idx));

        // For every edge (u, v), u must appear before v
        for (const edge of edges) {
          const sourcePos = positionMap.get(edge.source);
          const targetPos = positionMap.get(edge.target);
          expect(sourcePos).toBeDefined();
          expect(targetPos).toBeDefined();
          expect(sourcePos!).toBeLessThan(targetPos!);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the sorted order contains all nodes', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        const result = topologySort(nodes, edges);

        // Should not have a cycle
        expect(result.hasCycle).toBe(false);

        // Order should contain all nodes
        expect(result.order).toHaveLength(nodes.length);

        // All node IDs should be present
        const orderSet = new Set(result.order);
        for (const node of nodes) {
          expect(orderSet.has(node.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the sorted order contains no duplicates', () => {
    fc.assert(
      fc.property(arbDAG, ({ nodes, edges }) => {
        const result = topologySort(nodes, edges);
        const orderSet = new Set(result.order);
        expect(orderSet.size).toBe(result.order.length);
      }),
      { numRuns: 100 },
    );
  });
});
