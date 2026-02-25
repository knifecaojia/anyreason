/**
 * Property-Based Tests for serializer.ts
 *
 * Uses fast-check to verify universal properties of the canvas serializer.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import {
  serializeCanvas,
  deserializeCanvas,
  CURRENT_VERSION,
} from '../../lib/canvas/serializer';

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

const arbViewport = fc.record({
  x: fc.double({ min: -5000, max: 5000, noNaN: true }),
  y: fc.double({ min: -5000, max: 5000, noNaN: true }),
  zoom: fc.double({ min: 0.01, max: 10, noNaN: true }),
});

const arbPortType = fc.constantFrom('text', 'image', 'video', 'asset-ref', 'storyboard-list');

/** Generate a random node data object based on node type */
const arbNodeData = fc.record({
  label: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  collapsed: fc.option(fc.boolean(), { nil: undefined }),
});

/** Generate a ReactFlow Node for serialization */
const arbNode = fc.record({
  id: fc.uuid(),
  type: arbNodeType,
  position: arbPosition,
  data: arbNodeData,
}).map(({ id, type, position, data }) => ({
  id,
  type,
  position,
  data: { ...data },
} as Node));

/** Generate a ReactFlow Edge for serialization */
function arbEdgesForNodes(nodeIds: string[]) {
  if (nodeIds.length < 2) return fc.constant([] as Edge[]);
  return fc.array(
    fc.record({
      sourceIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
      targetIdx: fc.integer({ min: 0, max: nodeIds.length - 1 }),
      sourceHandle: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      targetHandle: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      portType: fc.option(arbPortType, { nil: undefined }),
    }),
    { minLength: 0, maxLength: 5 },
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

/** Generate a complete canvas state (nodes + edges + viewport) */
const arbCanvasState = fc
  .array(arbNode, { minLength: 0, maxLength: 8 })
  .chain((nodes) => {
    const nodeIds = nodes.map((n) => n.id);
    return fc.record({
      nodes: fc.constant(nodes),
      edges: arbEdgesForNodes(nodeIds),
      viewport: arbViewport,
      canvasId: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.length > 0),
    });
  });

// ===== Property 20: 序列化往返一致性 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 20: Serialization round-trip consistency', () => {
  /**
   * Property 20: 序列化往返一致性
   * For any valid workflow snapshot (with any combination of 10 node types,
   * any connections and viewport state), serialize → JSON.stringify → JSON.parse
   * → deserialize should produce an equivalent workflow state.
   *
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
   */
  it('serialize → stringify → parse → deserialize produces equivalent state', () => {
    fc.assert(
      fc.property(arbCanvasState, ({ nodes, edges, viewport, canvasId }) => {
        // Serialize
        const snapshot = serializeCanvas(canvasId, nodes, edges, viewport);

        // Stringify → Parse → Deserialize
        const json = JSON.stringify(snapshot);
        const result = deserializeCanvas(json);

        // Must succeed
        expect(result.success).toBe(true);
        if (!result.success) return;

        const restored = result.snapshot;

        // The ground truth for round-trip is the JSON-parsed version of the
        // serialized snapshot, since JSON.stringify normalizes values like -0 → 0.
        const jsonNormalized = JSON.parse(json);

        // Version and canvasId preserved
        expect(restored.version).toBe(CURRENT_VERSION);
        expect(restored.canvasId).toBe(canvasId);

        // Viewport preserved (compare against JSON-normalized values)
        expect(restored.reactflow.viewport.x).toBe(jsonNormalized.reactflow.viewport.x);
        expect(restored.reactflow.viewport.y).toBe(jsonNormalized.reactflow.viewport.y);
        expect(restored.reactflow.viewport.zoom).toBe(jsonNormalized.reactflow.viewport.zoom);

        // Node count preserved
        expect(restored.reactflow.nodes.length).toBe(snapshot.reactflow.nodes.length);

        // Each node's fields preserved
        for (let i = 0; i < snapshot.reactflow.nodes.length; i++) {
          const orig = jsonNormalized.reactflow.nodes[i];
          const rest = restored.reactflow.nodes[i];
          expect(rest.id).toBe(orig.id);
          expect(rest.type).toBe(orig.type);
          expect(rest.position.x).toBe(orig.position.x);
          expect(rest.position.y).toBe(orig.position.y);
          expect(rest.data).toEqual(orig.data);
          expect(rest.collapsed).toBe(orig.collapsed);
        }

        // Edge count preserved
        expect(restored.reactflow.edges.length).toBe(snapshot.reactflow.edges.length);

        // Each edge's fields preserved
        for (let i = 0; i < snapshot.reactflow.edges.length; i++) {
          const orig = jsonNormalized.reactflow.edges[i];
          const rest = restored.reactflow.edges[i];
          expect(rest.id).toBe(orig.id);
          expect(rest.source).toBe(orig.source);
          expect(rest.target).toBe(orig.target);
          expect(rest.sourceHandle).toBe(orig.sourceHandle);
          expect(rest.targetHandle).toBe(orig.targetHandle);
          expect(rest.data).toEqual(orig.data);
        }

        // updatedAt preserved
        expect(restored.updatedAt).toBe(snapshot.updatedAt);
      }),
      { numRuns: 150 },
    );
  });
});

// ===== Property 21: 序列化输出符合 Schema =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 21: Serialized output conforms to Schema', () => {
  /**
   * Property 21: 序列化输出符合 Schema
   * For any valid canvas state (any nodes, edges, viewport combination),
   * serializeCanvas output should pass JSON Schema validation via deserializeCanvas.
   *
   * **Validates: Requirements 7.4, 6.7**
   */
  it('serializeCanvas output passes deserializeCanvas validation', () => {
    fc.assert(
      fc.property(arbCanvasState, ({ nodes, edges, viewport, canvasId }) => {
        const snapshot = serializeCanvas(canvasId, nodes, edges, viewport);
        const json = JSON.stringify(snapshot);
        const result = deserializeCanvas(json);

        expect(result.success).toBe(true);
        if (!result.success) {
          // Provide diagnostic info if it fails
          throw new Error(`Validation failed: ${result.errors.join('; ')}`);
        }
      }),
      { numRuns: 150 },
    );
  });
});

// ===== Property 22: 非法输入被 Schema 拒绝 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 22: Invalid input rejected by Schema', () => {
  /**
   * Property 22: 非法输入被 Schema 拒绝
   * For any JSON string that does not conform to the JSON Schema (missing
   * required fields, wrong types, invalid node types, etc.), deserializeCanvas
   * should return { success: false, errors: [...] } with non-empty errors.
   *
   * **Validates: Requirements 7.5, 6.8**
   */

  it('missing required top-level fields are rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('version', 'canvasId', 'reactflow', 'updatedAt'),
        (missingField) => {
          const validSnapshot = {
            version: CURRENT_VERSION,
            canvasId: 'test-canvas',
            reactflow: {
              nodes: [],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: new Date().toISOString(),
          };

          // Remove one required field
          const broken = { ...validSnapshot };
          delete (broken as any)[missingField];

          const result = deserializeCanvas(JSON.stringify(broken));
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('invalid node types are rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) =>
            ![
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
            ].includes(s),
        ),
        (invalidType) => {
          const snapshot = {
            version: CURRENT_VERSION,
            canvasId: 'test-canvas',
            reactflow: {
              nodes: [
                {
                  id: 'n1',
                  type: invalidType,
                  position: { x: 0, y: 0 },
                  data: {},
                },
              ],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
            updatedAt: new Date().toISOString(),
          };

          const result = deserializeCanvas(JSON.stringify(snapshot));
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('wrong field types are rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          // version is not an integer
          { version: 'not-a-number', canvasId: 'c1', reactflow: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updatedAt: new Date().toISOString() },
          // canvasId is empty
          { version: CURRENT_VERSION, canvasId: '', reactflow: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updatedAt: new Date().toISOString() },
          // version is 0 (must be >= 1)
          { version: 0, canvasId: 'c1', reactflow: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updatedAt: new Date().toISOString() },
          // zoom is 0 (must be > 0)
          { version: CURRENT_VERSION, canvasId: 'c1', reactflow: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0 } }, updatedAt: new Date().toISOString() },
          // zoom is negative
          { version: CURRENT_VERSION, canvasId: 'c1', reactflow: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: -1 } }, updatedAt: new Date().toISOString() },
          // nodes is not an array
          { version: CURRENT_VERSION, canvasId: 'c1', reactflow: { nodes: 'not-array', edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updatedAt: new Date().toISOString() },
          // reactflow is null
          { version: CURRENT_VERSION, canvasId: 'c1', reactflow: null, updatedAt: new Date().toISOString() },
          // node missing data field
          { version: CURRENT_VERSION, canvasId: 'c1', reactflow: { nodes: [{ id: 'n1', type: 'scriptNode', position: { x: 0, y: 0 } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updatedAt: new Date().toISOString() },
        ),
        (invalidSnapshot) => {
          const result = deserializeCanvas(JSON.stringify(invalidSnapshot));
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('completely invalid JSON is rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        (invalidJson) => {
          const result = deserializeCanvas(invalidJson);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
