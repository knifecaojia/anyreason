import type { Node, Edge } from '@xyflow/react';
import {
  serializeCanvas,
  deserializeCanvas,
  migrateSnapshot,
  exportToFile,
  exportSelectedNodes,
  importFromFile,
  CURRENT_VERSION,
} from '../../lib/canvas/serializer';
import type { WorkflowSnapshot } from '../../lib/canvas/types';

// ===== Helpers =====

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 10, y: 20 }, data } as Node;
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  data?: Record<string, unknown>
): Edge {
  return { id, source, target, data } as Edge;
}

function makeValidSnapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return {
    version: CURRENT_VERSION,
    canvasId: 'canvas-1',
    reactflow: {
      nodes: [
        {
          id: 'n1',
          type: 'textNoteNode',
          position: { x: 0, y: 0 },
          data: { kind: 'text-note', title: 'Note', content: 'Hello' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ===== serializeCanvas =====

describe('serializeCanvas', () => {
  test('produces a valid snapshot with correct version', () => {
    const nodes = [makeNode('n1', 'scriptNode', { kind: 'script', text: 'hello' })];
    const edges = [makeEdge('e1', 'n1', 'n2', { portType: 'text' })];
    const viewport = { x: 100, y: 200, zoom: 1.5 };

    const snapshot = serializeCanvas('canvas-1', nodes, edges, viewport);

    expect(snapshot.version).toBe(CURRENT_VERSION);
    expect(snapshot.canvasId).toBe('canvas-1');
    expect(snapshot.reactflow.nodes).toHaveLength(1);
    expect(snapshot.reactflow.nodes[0].id).toBe('n1');
    expect(snapshot.reactflow.nodes[0].type).toBe('scriptNode');
    expect(snapshot.reactflow.nodes[0].position).toEqual({ x: 10, y: 20 });
    expect(snapshot.reactflow.edges).toHaveLength(1);
    expect(snapshot.reactflow.edges[0].data?.portType).toBe('text');
    expect(snapshot.reactflow.viewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
    expect(snapshot.updatedAt).toBeDefined();
  });

  test('includes collapsed state from node data', () => {
    const nodes = [makeNode('n1', 'generatorNode', { collapsed: true })];
    const snapshot = serializeCanvas('c1', nodes, [], { x: 0, y: 0, zoom: 1 });
    expect(snapshot.reactflow.nodes[0].collapsed).toBe(true);
  });

  test('omits collapsed when not present in data', () => {
    const nodes = [makeNode('n1', 'generatorNode', { kind: 'generator' })];
    const snapshot = serializeCanvas('c1', nodes, [], { x: 0, y: 0, zoom: 1 });
    expect(snapshot.reactflow.nodes[0].collapsed).toBeUndefined();
  });

  test('handles empty canvas', () => {
    const snapshot = serializeCanvas('empty', [], [], { x: 0, y: 0, zoom: 1 });
    expect(snapshot.reactflow.nodes).toEqual([]);
    expect(snapshot.reactflow.edges).toEqual([]);
  });
});


// ===== deserializeCanvas =====

describe('deserializeCanvas', () => {
  test('deserializes a valid snapshot', () => {
    const snapshot = makeValidSnapshot();
    const json = JSON.stringify(snapshot);
    const result = deserializeCanvas(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.snapshot.canvasId).toBe('canvas-1');
      expect(result.snapshot.reactflow.nodes).toHaveLength(1);
    }
  });

  test('rejects invalid JSON', () => {
    const result = deserializeCanvas('not json at all');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain('Invalid JSON: failed to parse input');
    }
  });

  test('rejects missing required fields', () => {
    const result = deserializeCanvas(JSON.stringify({ version: 1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test('rejects invalid node type', () => {
    const snapshot = makeValidSnapshot();
    snapshot.reactflow.nodes[0].type = 'unknownNode';
    const result = deserializeCanvas(JSON.stringify(snapshot));
    expect(result.success).toBe(false);
  });

  test('rejects zero zoom', () => {
    const snapshot = makeValidSnapshot();
    snapshot.reactflow.viewport.zoom = 0;
    const result = deserializeCanvas(JSON.stringify(snapshot));
    expect(result.success).toBe(false);
  });

  test('rejects empty canvasId', () => {
    const snapshot = makeValidSnapshot({ canvasId: '' });
    const result = deserializeCanvas(JSON.stringify(snapshot));
    expect(result.success).toBe(false);
  });
});

// ===== migrateSnapshot =====

describe('migrateSnapshot', () => {
  test('migrates v1 to current version', () => {
    const v1: WorkflowSnapshot = {
      version: 1,
      canvasId: 'c1',
      reactflow: {
        nodes: [
          { id: 'n1', type: 'scriptNode', position: { x: 0, y: 0 }, data: { text: 'hi' } },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      updatedAt: new Date().toISOString(),
    };

    const migrated = migrateSnapshot(v1);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.reactflow.nodes[0].collapsed).toBe(false);
    expect(migrated.reactflow.edges[0].data?.portType).toBe('text');
  });

  test('does not modify current version snapshots', () => {
    const current = makeValidSnapshot();
    const migrated = migrateSnapshot(current);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.reactflow.nodes).toEqual(current.reactflow.nodes);
  });

  test('preserves all node and edge data during migration', () => {
    const v1: WorkflowSnapshot = {
      version: 1,
      canvasId: 'c1',
      reactflow: {
        nodes: [
          { id: 'n1', type: 'generatorNode', position: { x: 5, y: 10 }, data: { model: 'sd' } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'out', targetHandle: 'in' },
        ],
        viewport: { x: 100, y: 200, zoom: 2 },
      },
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const migrated = migrateSnapshot(v1);
    expect(migrated.reactflow.nodes[0].data).toMatchObject({ model: 'sd' });
    expect(migrated.reactflow.nodes[0].position).toEqual({ x: 5, y: 10 });
    expect(migrated.reactflow.edges[0].sourceHandle).toBe('out');
    expect(migrated.reactflow.edges[0].targetHandle).toBe('in');
    expect(migrated.canvasId).toBe('c1');
    expect(migrated.updatedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  test('does not mutate the original snapshot', () => {
    const v1: WorkflowSnapshot = {
      version: 1,
      canvasId: 'c1',
      reactflow: {
        nodes: [{ id: 'n1', type: 'scriptNode', position: { x: 0, y: 0 }, data: {} }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      updatedAt: new Date().toISOString(),
    };

    migrateSnapshot(v1);
    expect(v1.version).toBe(1);
    expect(v1.reactflow.nodes[0].collapsed).toBeUndefined();
  });
});

// ===== exportToFile =====

describe('exportToFile', () => {
  test('returns valid JSON string', () => {
    const snapshot = makeValidSnapshot();
    const result = exportToFile(snapshot);
    const parsed = JSON.parse(result);
    expect(parsed.canvasId).toBe('canvas-1');
  });

  test('uses custom filename', () => {
    const snapshot = makeValidSnapshot();
    // Just verify it doesn't throw with a custom filename
    const result = exportToFile(snapshot, 'my-workflow.json');
    expect(typeof result).toBe('string');
  });
});

// ===== exportSelectedNodes =====

describe('exportSelectedNodes', () => {
  test('exports only selected nodes', () => {
    const nodes = [
      makeNode('n1', 'scriptNode'),
      makeNode('n2', 'generatorNode'),
      makeNode('n3', 'previewNode'),
    ];
    const edges = [
      makeEdge('e1', 'n1', 'n2'),
      makeEdge('e2', 'n2', 'n3'),
    ];

    const snapshot = exportSelectedNodes(['n1', 'n2'], nodes, edges, 'c1');
    expect(snapshot.reactflow.nodes).toHaveLength(2);
    expect(snapshot.reactflow.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  test('only includes edges where both endpoints are selected', () => {
    const nodes = [
      makeNode('n1', 'scriptNode'),
      makeNode('n2', 'generatorNode'),
      makeNode('n3', 'previewNode'),
    ];
    const edges = [
      makeEdge('e1', 'n1', 'n2'),
      makeEdge('e2', 'n2', 'n3'),
    ];

    const snapshot = exportSelectedNodes(['n1', 'n2'], nodes, edges, 'c1');
    expect(snapshot.reactflow.edges).toHaveLength(1);
    expect(snapshot.reactflow.edges[0].source).toBe('n1');
    expect(snapshot.reactflow.edges[0].target).toBe('n2');
  });

  test('returns empty when no nodes selected', () => {
    const nodes = [makeNode('n1', 'scriptNode')];
    const snapshot = exportSelectedNodes([], nodes, [], 'c1');
    expect(snapshot.reactflow.nodes).toHaveLength(0);
    expect(snapshot.reactflow.edges).toHaveLength(0);
  });
});

// ===== importFromFile =====

describe('importFromFile', () => {
  test('imports a valid JSON file', async () => {
    const snapshot = makeValidSnapshot();
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    const file = new File([blob], 'test.json', { type: 'application/json' });

    const result = await importFromFile(file);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.snapshot.canvasId).toBe('canvas-1');
    }
  });

  test('rejects invalid JSON file', async () => {
    const blob = new Blob(['not valid json'], { type: 'application/json' });
    const file = new File([blob], 'bad.json', { type: 'application/json' });

    const result = await importFromFile(file);
    expect(result.success).toBe(false);
  });
});
