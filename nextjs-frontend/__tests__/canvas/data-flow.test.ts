import type { Node, Edge } from '@xyflow/react';
import {
  topologySort,
  wouldCreateCycle,
  getDownstreamNodes,
  propagateData,
} from '../../lib/canvas/data-flow';

// ===== Helpers =====

function makeNode(id: string): Node {
  return { id, type: 'generatorNode', position: { x: 0, y: 0 }, data: {} } as Node;
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge {
  return { id, source, target, sourceHandle, targetHandle } as Edge;
}

// ===== topologySort =====

describe('topologySort', () => {
  test('returns all nodes in order for empty edge list', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const result = topologySort(nodes, []);
    expect(result.hasCycle).toBe(false);
    expect(result.cycleNodes).toBeUndefined();
    expect(result.order).toHaveLength(3);
    expect(new Set(result.order)).toEqual(new Set(['a', 'b', 'c']));
  });

  test('returns correct order for linear chain a → b → c', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
    const result = topologySort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toEqual(['a', 'b', 'c']);
  });

  test('detects a simple cycle a → b → a', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')];
    const result = topologySort(nodes, edges);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodes).toBeDefined();
    expect(result.cycleNodes!.sort()).toEqual(['a', 'b']);
  });

  test('detects cycle in a 3-node ring a → b → c → a', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'b', 'c'),
      makeEdge('e3', 'c', 'a'),
    ];
    const result = topologySort(nodes, edges);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodes).toHaveLength(3);
  });

  test('handles single node with no edges', () => {
    const nodes = [makeNode('x')];
    const result = topologySort(nodes, []);
    expect(result.order).toEqual(['x']);
    expect(result.hasCycle).toBe(false);
  });

  test('handles empty graph', () => {
    const result = topologySort([], []);
    expect(result.order).toEqual([]);
    expect(result.hasCycle).toBe(false);
  });

  test('ignores edges referencing non-existent nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'ghost')];
    const result = topologySort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toHaveLength(2);
  });

  test('handles diamond DAG: a → b, a → c, b → d, c → d', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'b', 'd'),
      makeEdge('e4', 'c', 'd'),
    ];
    const result = topologySort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.order[0]).toBe('a');
    expect(result.order[result.order.length - 1]).toBe('d');
    expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'));
    expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('c'));
  });
});

// ===== wouldCreateCycle =====

describe('wouldCreateCycle', () => {
  test('returns false for adding edge to empty graph', () => {
    expect(wouldCreateCycle([], { source: 'a', target: 'b' })).toBe(false);
  });

  test('returns true for self-loop', () => {
    expect(wouldCreateCycle([], { source: 'a', target: 'a' })).toBe(true);
  });

  test('returns true when reverse edge would create cycle', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(wouldCreateCycle(edges, { source: 'b', target: 'a' })).toBe(true);
  });

  test('returns false when edge does not create cycle', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(wouldCreateCycle(edges, { source: 'a', target: 'c' })).toBe(false);
  });

  test('detects indirect cycle: a→b, b→c, adding c→a', () => {
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
    expect(wouldCreateCycle(edges, { source: 'c', target: 'a' })).toBe(true);
  });

  test('returns false for parallel edge (not a cycle)', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(wouldCreateCycle(edges, { source: 'a', target: 'b' })).toBe(false);
  });
});

// ===== getDownstreamNodes =====

describe('getDownstreamNodes', () => {
  test('returns empty array when no outgoing edges', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(getDownstreamNodes('b', edges)).toEqual([]);
  });

  test('returns direct successors', () => {
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = getDownstreamNodes('a', edges);
    expect(result.sort()).toEqual(['b', 'c']);
  });

  test('returns transitive downstream nodes', () => {
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'b', 'c'),
      makeEdge('e3', 'c', 'd'),
    ];
    const result = getDownstreamNodes('a', edges);
    expect(result.sort()).toEqual(['b', 'c', 'd']);
  });

  test('does not include the starting node', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(getDownstreamNodes('a', edges)).not.toContain('a');
  });

  test('handles diamond graph without duplicates', () => {
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'b', 'd'),
      makeEdge('e4', 'c', 'd'),
    ];
    const result = getDownstreamNodes('a', edges);
    expect(result.sort()).toEqual(['b', 'c', 'd']);
  });

  test('returns empty for non-existent node', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(getDownstreamNodes('z', edges)).toEqual([]);
  });

  test('returns empty for empty edges', () => {
    expect(getDownstreamNodes('a', [])).toEqual([]);
  });
});

// ===== propagateData =====

describe('propagateData', () => {
  test('updates directly connected target node data', () => {
    const nodes = [
      { ...makeNode('s1'), data: {} },
      { ...makeNode('t1'), data: {} },
    ];
    const edges = [makeEdge('e1', 's1', 't1', 'text', 'in-script')];
    let updatedNodes: Node[] = [];

    const setNodes = (updater: (nodes: Node[]) => Node[]) => {
      updatedNodes = updater(nodes);
    };

    propagateData('s1', 'text', 'hello world', nodes, edges, setNodes);

    const target = updatedNodes.find((n) => n.id === 't1');
    expect(target).toBeDefined();
    expect((target!.data as Record<string, unknown>)['in-script']).toBe('hello world');
  });

  test('does not modify unconnected nodes', () => {
    const nodes = [
      { ...makeNode('s1'), data: {} },
      { ...makeNode('t1'), data: {} },
      { ...makeNode('other'), data: { existing: true } },
    ];
    const edges = [makeEdge('e1', 's1', 't1', 'text', 'in-script')];
    let updatedNodes: Node[] = [];

    const setNodes = (updater: (nodes: Node[]) => Node[]) => {
      updatedNodes = updater(nodes);
    };

    propagateData('s1', 'text', 'data', nodes, edges, setNodes);

    const other = updatedNodes.find((n) => n.id === 'other');
    expect(other).toBeDefined();
    expect((other!.data as Record<string, unknown>)['in-script']).toBeUndefined();
  });

  test('does nothing when no matching edges', () => {
    const nodes = [makeNode('s1'), makeNode('t1')];
    const edges = [makeEdge('e1', 's1', 't1', 'image', 'in-image')];
    let called = false;

    const setNodes = () => {
      called = true;
    };

    propagateData('s1', 'text', 'data', nodes, edges, setNodes);
    expect(called).toBe(false);
  });

  test('propagates to multiple targets (fan-out)', () => {
    const nodes = [makeNode('s1'), makeNode('t1'), makeNode('t2')];
    const edges = [
      makeEdge('e1', 's1', 't1', 'text', 'in-script'),
      makeEdge('e2', 's1', 't2', 'text', 'in-script'),
    ];
    let updatedNodes: Node[] = [];

    const setNodes = (updater: (nodes: Node[]) => Node[]) => {
      updatedNodes = updater(nodes);
    };

    propagateData('s1', 'text', 'broadcast', nodes, edges, setNodes);

    const t1 = updatedNodes.find((n) => n.id === 't1');
    const t2 = updatedNodes.find((n) => n.id === 't2');
    expect((t1!.data as Record<string, unknown>)['in-script']).toBe('broadcast');
    expect((t2!.data as Record<string, unknown>)['in-script']).toBe('broadcast');
  });
});
