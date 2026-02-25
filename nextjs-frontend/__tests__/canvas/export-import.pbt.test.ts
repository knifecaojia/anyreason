/**
 * Property-Based Tests for export/import functionality in serializer.ts
 *
 * Uses fast-check to verify universal properties of export and migration.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import {
  exportSelectedNodes,
  migrateSnapshot,
  CURRENT_VERSION,
} from '../../lib/canvas/serializer';
import type { WorkflowSnapshot, PortDataType } from '../../lib/canvas/types';

// ===== Generators =====

const arbNodeType = fc.constantFrom(
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
);

const arbPosition = fc.record({
  x: fc.double({ min: -10000, max: 10000, noNaN: true }),
  y: fc.double({ min: -10000, max: 10000, noNaN: true }),
});

const arbPortType = fc.constantFrom<PortDataType>('text', 'image', 'video', 'asset-ref', 'storyboard-list');

/** Generate a ReactFlow Node */
const arbNode = fc.record({
  id: fc.uuid(),
  type: arbNodeType,
  position: arbPosition,
  data: fc.record({
    label: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
    collapsed: fc.option(fc.boolean(), { nil: undefined }),
  }),
}).map(({ id, type, position, data }) => ({
  id,
  type,
  position,
  data: { ...data },
} as Node));

/** Generate a list of nodes with unique IDs */
const arbNodeList = fc.array(arbNode, { minLength: 1, maxLength: 12 }).map((nodes) => {
  // Ensure unique IDs
  const seen = new Set<string>();
  return nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
});

/** Generate edges that reference existing node IDs */
function arbEdgesForNodes(nodeIds: string[]) {
  if (nodeIds.length < 2) return fc.constant([] as Edge[]);
  return fc.array(
    fc.record({
      sourceIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
      targetIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
      sourceHandle: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
      targetHandle: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
      portType: fc.option(arbPortType, { nil: undefined }),
    }),
    { minLength: 0, maxLength: 8 },
  ).map((specs) =>
    specs
      .filter((s) => s.sourceIdx !== s.targetIdx)
      .map((s, i) => {
        const edge: Edge = {
          id: `edge-${i}-${s.sourceIdx}-${s.targetIdx}`,
          source: nodeIds[s.sourceIdx],
          target: nodeIds[s.targetIdx],
        } as Edge;
        if (s.sourceHandle) (edge as any).sourceHandle = s.sourceHandle;
        if (s.targetHandle) (edge as any).targetHandle = s.targetHandle;
        if (s.portType) (edge as any).data = { portType: s.portType };
        return edge;
      }),
  );
}

/** Generate a v1 WorkflowSnapshot for migration testing */
const arbV1Snapshot: fc.Arbitrary<WorkflowSnapshot> = fc
  .array(
    fc.record({
      id: fc.uuid(),
      type: arbNodeType,
      position: arbPosition,
      data: fc.record({
        label: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
      }),
    }),
    { minLength: 0, maxLength: 8 },
  )
  .map((rawNodes) => {
    // Deduplicate IDs
    const seen = new Set<string>();
    return rawNodes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  })
  .chain((nodes) => {
    const nodeIds = nodes.map((n) => n.id);
    // Generate edges referencing these node IDs
    const edgesArb =
      nodeIds.length < 2
        ? fc.constant([] as Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>)
        : fc.array(
            fc.record({
              sourceIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
              targetIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
            }),
            { minLength: 0, maxLength: 5 },
          ).map((specs) =>
            specs
              .filter((s) => s.sourceIdx !== s.targetIdx)
              .map((s, i) => ({
                id: `e-${i}`,
                source: nodeIds[s.sourceIdx],
                target: nodeIds[s.targetIdx],
              })),
          );

    return fc.record({
      nodes: fc.constant(nodes),
      edges: edgesArb,
      canvasId: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0),
    });
  })
  .map(({ nodes, edges, canvasId }) => ({
    version: 1,
    canvasId,
    reactflow: {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as string,
        position: { x: n.position.x, y: n.position.y },
        data: { ...(n.data as Record<string, unknown>) },
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
      })),
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    updatedAt: new Date().toISOString(),
  }));

// ===== Property 18: 选中节点导出 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 18: Selected nodes export', () => {
  /**
   * Property 18: 选中节点导出
   * For any set of nodes and edges on the canvas and any selected subset of node IDs,
   * exportSelectedNodes output should contain only the selected nodes and only edges
   * where both source and target are in the selected set.
   *
   * **Validates: Requirements 6.6**
   */
  it('export contains only selected nodes and edges with both endpoints in selected set', () => {
    fc.assert(
      fc.property(
        arbNodeList.chain((nodes) => {
          const nodeIds = nodes.map((n) => n.id);
          return fc.record({
            nodes: fc.constant(nodes),
            edges: arbEdgesForNodes(nodeIds),
            // Select a random subset of node IDs
            selectedIds: fc.subarray(nodeIds, { minLength: 0 }),
          });
        }),
        ({ nodes, edges, selectedIds }) => {
          const canvasId = 'test-canvas';
          const snapshot = exportSelectedNodes(selectedIds, nodes, edges, canvasId);
          const selectedSet = new Set(selectedIds);

          // All exported nodes must be in the selected set
          for (const node of snapshot.reactflow.nodes) {
            expect(selectedSet.has(node.id)).toBe(true);
          }

          // Exported node count must equal selected count
          expect(snapshot.reactflow.nodes.length).toBe(selectedIds.length);

          // All exported edges must have both source and target in the selected set
          for (const edge of snapshot.reactflow.edges) {
            expect(selectedSet.has(edge.source)).toBe(true);
            expect(selectedSet.has(edge.target)).toBe(true);
          }

          // No edge from the original set that has both endpoints selected should be missing
          const exportedEdgeIds = new Set(snapshot.reactflow.edges.map((e) => e.id));
          for (const edge of edges) {
            if (selectedSet.has(edge.source) && selectedSet.has(edge.target)) {
              expect(exportedEdgeIds.has(edge.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ===== Property 19: 版本迁移数据保持 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 19: Version migration data preservation', () => {
  /**
   * Property 19: 版本迁移数据保持
   * For any old-version workflow snapshot, migrateSnapshot should produce a snapshot
   * with version equal to CURRENT_VERSION, and all original nodes and edges data
   * should be preserved in the migrated snapshot.
   *
   * **Validates: Requirements 6.9**
   */
  it('migration updates version to CURRENT_VERSION and preserves all nodes and edges', () => {
    fc.assert(
      fc.property(arbV1Snapshot, (v1Snapshot) => {
        // migrateSnapshot uses JSON.parse(JSON.stringify(...)) internally,
        // which normalizes -0 to 0 and strips undefined values.
        // We compare against the same JSON-normalized original for fairness.
        const normalized: WorkflowSnapshot = JSON.parse(JSON.stringify(v1Snapshot));
        const migrated = migrateSnapshot(v1Snapshot);

        // Version must be updated to CURRENT_VERSION
        expect(migrated.version).toBe(CURRENT_VERSION);

        // All original nodes must be preserved
        expect(migrated.reactflow.nodes.length).toBe(normalized.reactflow.nodes.length);

        for (let i = 0; i < normalized.reactflow.nodes.length; i++) {
          const original = normalized.reactflow.nodes[i];
          const migratedNode = migrated.reactflow.nodes[i];

          // Core fields preserved
          expect(migratedNode.id).toBe(original.id);
          expect(migratedNode.type).toBe(original.type);
          expect(migratedNode.position.x).toBe(original.position.x);
          expect(migratedNode.position.y).toBe(original.position.y);

          // Original data fields preserved (migrated may add new fields)
          for (const [key, value] of Object.entries(original.data)) {
            expect(migratedNode.data[key]).toEqual(value);
          }
        }

        // All original edges must be preserved
        expect(migrated.reactflow.edges.length).toBe(normalized.reactflow.edges.length);

        for (let i = 0; i < normalized.reactflow.edges.length; i++) {
          const original = normalized.reactflow.edges[i];
          const migratedEdge = migrated.reactflow.edges[i];

          // Core fields preserved
          expect(migratedEdge.id).toBe(original.id);
          expect(migratedEdge.source).toBe(original.source);
          expect(migratedEdge.target).toBe(original.target);

          // Optional fields preserved if they existed
          if (original.sourceHandle !== undefined) {
            expect(migratedEdge.sourceHandle).toBe(original.sourceHandle);
          }
          if (original.targetHandle !== undefined) {
            expect(migratedEdge.targetHandle).toBe(original.targetHandle);
          }
        }

        // Original snapshot should not be mutated
        expect(v1Snapshot.version).toBe(1);
      }),
      { numRuns: 150 },
    );
  });
});
