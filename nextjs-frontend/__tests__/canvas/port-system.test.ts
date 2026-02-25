import type { Node, Edge } from '@xyflow/react';
import {
  PORT_COLORS,
  arePortsCompatible,
  validateConnection,
} from '../../lib/canvas/port-system';
import type { PortDefinition, PortDataType } from '../../lib/canvas/types';
import { getAllNodeTypes } from '../../lib/canvas/node-registry';

// ===== PORT_COLORS =====

describe('PORT_COLORS', () => {
  test('maps all 5 data types to hex color strings', () => {
    const types: PortDataType[] = ['text', 'image', 'video', 'asset-ref', 'storyboard-list'];
    for (const t of types) {
      expect(PORT_COLORS[t]).toBeDefined();
      expect(PORT_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('assigns correct colors per spec', () => {
    expect(PORT_COLORS['text']).toBe('#3b82f6');        // blue
    expect(PORT_COLORS['image']).toBe('#a855f7');       // purple
    expect(PORT_COLORS['video']).toBe('#22c55e');       // green
    expect(PORT_COLORS['asset-ref']).toBe('#f97316');   // orange
    expect(PORT_COLORS['storyboard-list']).toBe('#06b6d4'); // cyan
  });

  test('all colors are unique', () => {
    const values = Object.values(PORT_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ===== arePortsCompatible =====

describe('arePortsCompatible', () => {
  const makePort = (
    direction: 'input' | 'output',
    dataType: PortDataType,
  ): PortDefinition => ({
    id: `port-${direction}-${dataType}`,
    direction,
    dataType,
    label: dataType,
  });

  test('returns true for matching output→input with same dataType', () => {
    const types: PortDataType[] = ['text', 'image', 'video', 'asset-ref', 'storyboard-list'];
    for (const t of types) {
      expect(arePortsCompatible(makePort('output', t), makePort('input', t))).toBe(true);
    }
  });

  test('returns false when dataTypes differ', () => {
    expect(
      arePortsCompatible(makePort('output', 'text'), makePort('input', 'image')),
    ).toBe(false);
  });

  test('returns false when source is input (wrong direction)', () => {
    expect(
      arePortsCompatible(makePort('input', 'text'), makePort('input', 'text')),
    ).toBe(false);
  });

  test('returns false when target is output (wrong direction)', () => {
    expect(
      arePortsCompatible(makePort('output', 'text'), makePort('output', 'text')),
    ).toBe(false);
  });
});

// ===== validateConnection =====

describe('validateConnection', () => {
  const registry = getAllNodeTypes();

  // Helper to create minimal nodes
  function makeNode(id: string, type: string): Node {
    return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
  }

  test('allows valid scriptNode.text → generatorNode.in-script connection', () => {
    const nodes = [makeNode('n1', 'scriptNode'), makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'text', target: 'n2', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result).toEqual({ valid: true });
  });

  test('allows valid assetNode.asset-ref → generatorNode.in-ref connection', () => {
    const nodes = [makeNode('n1', 'assetNode'), makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'asset-ref', target: 'n2', targetHandle: 'in-ref' },
      nodes,
      edges,
      registry,
    );
    expect(result).toEqual({ valid: true });
  });

  test('rejects incompatible types: scriptNode.text → generatorNode.in-ref', () => {
    const nodes = [makeNode('n1', 'scriptNode'), makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'text', target: 'n2', targetHandle: 'in-ref' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Incompatible');
  });

  test('rejects connection when source node not found', () => {
    const nodes = [makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'missing', sourceHandle: 'text', target: 'n2', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Source node not found');
  });

  test('rejects connection when target node not found', () => {
    const nodes = [makeNode('n1', 'scriptNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'text', target: 'missing', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Target node not found');
  });

  test('rejects connection with unknown node type', () => {
    const nodes = [
      { id: 'n1', type: 'unknownType', position: { x: 0, y: 0 }, data: {} } as Node,
      makeNode('n2', 'generatorNode'),
    ];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'text', target: 'n2', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown source node type');
  });

  test('rejects connection with invalid source handle', () => {
    const nodes = [makeNode('n1', 'scriptNode'), makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'nonexistent', target: 'n2', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Source output port');
  });

  test('rejects connection with invalid target handle', () => {
    const nodes = [makeNode('n1', 'scriptNode'), makeNode('n2', 'generatorNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'n1', sourceHandle: 'text', target: 'n2', targetHandle: 'nonexistent' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Target input port');
  });

  test('rejects connection that would create a cycle', () => {
    const nodes = [
      makeNode('n1', 'scriptNode'),
      makeNode('n2', 'slicerNode'),
    ];
    // Existing edge: n1 → n2
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' } as Edge,
    ];
    // Trying to add n2 → n1 would create a cycle
    // slicerNode has output 'storyboard-list' (storyboard-list type)
    // scriptNode has no input ports, so this would fail on port lookup first.
    // Let's use a chain: generatorNode → previewNode → (back to generatorNode)
    const nodes2 = [
      makeNode('g1', 'generatorNode'),
      makeNode('p1', 'previewNode'),
    ];
    const edges2: Edge[] = [
      { id: 'e1', source: 'g1', target: 'p1' } as Edge,
    ];
    // previewNode has output 'out-image' (image), generatorNode has no image input
    // Let's use a proper cycle scenario with 3 nodes
    const nodes3 = [
      makeNode('a', 'scriptNode'),
      makeNode('b', 'slicerNode'),
      makeNode('c', 'scriptNode'),
    ];
    // a.text → b.in-text, b → c already connected
    // Now try c → a — but scriptNode has no input ports.
    // Best approach: use generatorNode chain
    const nodesChain = [
      makeNode('g1', 'generatorNode'),
      makeNode('p1', 'previewNode'),
      makeNode('g2', 'generatorNode'),
    ];
    // g1.image → p1.in-image, p1.out-image → g2.in-script? No, type mismatch.
    // Let's just test cycle detection directly with a simple scenario
    // where the port types happen to match.
    const nodesCycle = [
      makeNode('s1', 'scriptNode'),
      makeNode('sl1', 'slicerNode'),
    ];
    // s1.text → sl1.in-text exists
    const edgesCycle: Edge[] = [
      { id: 'e1', source: 's1', target: 'sl1' } as Edge,
    ];
    // Now try sl1 → s1. slicerNode output is storyboard-list, scriptNode has no input.
    // This will fail on port lookup, not cycle detection.
    // For a pure cycle test, we need matching types in a loop.
    // generatorNode.image → previewNode.in-image → previewNode.out-image → generatorNode ???
    // generatorNode has no image input port.
    // Let's just test with two previewNodes that can chain images:
    const nodesLoop = [
      makeNode('p1', 'previewNode'),
      makeNode('p2', 'previewNode'),
    ];
    const edgesLoop: Edge[] = [
      { id: 'e1', source: 'p1', target: 'p2' } as Edge,
    ];
    // p2.out-image → p1.in-image would create a cycle
    const result = validateConnection(
      { source: 'p2', sourceHandle: 'out-image', target: 'p1', targetHandle: 'in-image' },
      nodesLoop,
      edgesLoop,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('cycle');
  });

  test('allows fan-out: one output to multiple inputs', () => {
    const nodes = [
      makeNode('s1', 'scriptNode'),
      makeNode('g1', 'generatorNode'),
      makeNode('g2', 'generatorNode'),
    ];
    // s1 already connected to g1
    const edges: Edge[] = [
      { id: 'e1', source: 's1', target: 'g1' } as Edge,
    ];
    // s1 → g2 should also be valid
    const result = validateConnection(
      { source: 's1', sourceHandle: 'text', target: 'g2', targetHandle: 'in-script' },
      nodes,
      edges,
      registry,
    );
    expect(result).toEqual({ valid: true });
  });

  test('rejects self-loop', () => {
    const nodes = [makeNode('p1', 'previewNode')];
    const edges: Edge[] = [];
    const result = validateConnection(
      { source: 'p1', sourceHandle: 'out-image', target: 'p1', targetHandle: 'in-image' },
      nodes,
      edges,
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('cycle');
  });
});
