import { renderHook, act } from '@testing-library/react';
import type { Node, Edge } from '@xyflow/react';
import { useDataFlow } from '../../hooks/useDataFlow';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { usePerformanceMode } from '../../hooks/usePerformanceMode';
import { useBatchQueue } from '../../hooks/useBatchQueue';

// ===== Helpers =====

function makeNode(id: string, type = 'textNoteNode'): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge {
  return { id, source, target, sourceHandle, targetHandle } as Edge;
}

// ===== useDataFlow =====

describe('useDataFlow', () => {
  test('returns topologyOrder and hasCycle for a simple DAG', () => {
    const nodes = [makeNode('a', 'scriptNode'), makeNode('b', 'generatorNode')];
    const edges = [makeEdge('e1', 'a', 'b', 'out-text', 'in-script')];
    const setNodes = jest.fn();

    const { result } = renderHook(() => useDataFlow(nodes, edges, setNodes));

    expect(result.current.topologyOrder).toEqual(['a', 'b']);
    expect(result.current.hasCycle).toBe(false);
  });

  test('detects cycle in graph', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')];
    const setNodes = jest.fn();

    const { result } = renderHook(() => useDataFlow(nodes, edges, setNodes));

    expect(result.current.hasCycle).toBe(true);
  });

  test('propagate calls setNodes', () => {
    const nodes = [makeNode('a', 'scriptNode'), makeNode('b', 'generatorNode')];
    const edges = [makeEdge('e1', 'a', 'b', 'out-text', 'in-script')];
    const setNodes = jest.fn();

    const { result } = renderHook(() => useDataFlow(nodes, edges, setNodes));

    act(() => {
      result.current.propagate('a', 'out-text', 'hello');
    });

    expect(setNodes).toHaveBeenCalled();
  });
});

// ===== useUndoRedo =====

describe('useUndoRedo', () => {
  test('initial state: canUndo and canRedo are false', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn();
    const setEdges = jest.fn();
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test('push enables undo', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn();
    const setEdges = jest.fn();
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    act(() => {
      result.current.push({ nodes: [makeNode('n1')], edges: [] });
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  test('undo restores state and calls setNodes/setEdges', () => {
    const nodes: Node[] = [makeNode('n1')];
    const edges: Edge[] = [];
    const setNodes = jest.fn();
    const setEdges = jest.fn();
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    const state = { nodes: [makeNode('n1')], edges: [] as Edge[] };
    act(() => {
      result.current.push(state);
    });

    act(() => {
      result.current.undo();
    });

    expect(setNodes).toHaveBeenCalled();
    expect(setEdges).toHaveBeenCalled();
    expect(result.current.canRedo).toBe(true);
  });

  test('redo restores undone state', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn((updater) => {
      const newNodes = typeof updater === 'function' ? updater(nodes) : updater;
      nodes.length = 0;
      nodes.push(...newNodes);
    });
    const setEdges = jest.fn((updater) => {
      const newEdges = typeof updater === 'function' ? updater(edges) : updater;
      edges.length = 0;
      edges.push(...newEdges);
    });
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    const state = { nodes: [makeNode('n1')], edges: [] as Edge[] };
    act(() => {
      result.current.push(state);
    });
    act(() => {
      result.current.undo();
    });

    act(() => {
      result.current.redo();
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  test('keyboard shortcut Ctrl+Z triggers undo', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn();
    const setEdges = jest.fn();
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    act(() => {
      result.current.push({ nodes: [makeNode('n1')], edges: [] });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    });

    expect(setNodes).toHaveBeenCalled();
  });

  test('keyboard shortcut Ctrl+Shift+Z triggers redo', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn((updater) => {
      const newNodes = typeof updater === 'function' ? updater(nodes) : updater;
      nodes.length = 0;
      nodes.push(...newNodes);
    });
    const setEdges = jest.fn((updater) => {
      const newEdges = typeof updater === 'function' ? updater(edges) : updater;
      edges.length = 0;
      edges.push(...newEdges);
    });
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    act(() => {
      result.current.push({ nodes: [makeNode('n1')], edges: [] });
    });
    act(() => {
      result.current.undo();
    });

    setNodes.mockClear();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true }));
    });

    expect(setNodes).toHaveBeenCalled();
  });

  test('keyboard shortcut Ctrl+Y triggers redo', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const setNodes = jest.fn((updater) => {
      const newNodes = typeof updater === 'function' ? updater(nodes) : updater;
      nodes.length = 0;
      nodes.push(...newNodes);
    });
    const setEdges = jest.fn((updater) => {
      const newEdges = typeof updater === 'function' ? updater(edges) : updater;
      edges.length = 0;
      edges.push(...newEdges);
    });
    const getNodes = () => nodes;
    const getEdges = () => edges;

    const { result } = renderHook(() => useUndoRedo(setNodes, setEdges, getNodes, getEdges));

    act(() => {
      result.current.push({ nodes: [makeNode('n1')], edges: [] });
    });
    act(() => {
      result.current.undo();
    });

    setNodes.mockClear();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
    });

    expect(setNodes).toHaveBeenCalled();
  });
});

// ===== usePerformanceMode =====

describe('usePerformanceMode', () => {
  test('initial mode is high-quality', () => {
    const { result } = renderHook(() => usePerformanceMode(10));

    expect(result.current.mode).toBe('high-quality');
  });

  test('setMode updates mode', () => {
    const { result } = renderHook(() => usePerformanceMode(10));

    act(() => {
      result.current.setMode('fast');
    });

    expect(result.current.mode).toBe('fast');
  });

  test('suggestedMode returns normal when nodeCount > 50', () => {
    const { result } = renderHook(() => usePerformanceMode(60));

    expect(result.current.suggestedMode).toBe('normal');
  });

  test('suggestedMode returns null when nodeCount <= 50', () => {
    const { result } = renderHook(() => usePerformanceMode(30));

    expect(result.current.suggestedMode).toBeNull();
  });

  test('getNodeRenderLevel returns correct level', () => {
    const { result } = renderHook(() => usePerformanceMode(10));

    // high-quality mode: always full
    const level = result.current.getNodeRenderLevel(
      { x: 0, y: 0 },
      { x: 0, y: 0, zoom: 1, width: 1920, height: 1080 },
    );
    expect(level).toBe('full');
  });

  test('getNodeRenderLevel respects mode change', () => {
    const { result } = renderHook(() => usePerformanceMode(10));

    act(() => {
      result.current.setMode('normal');
    });

    // Node far outside viewport
    const level = result.current.getNodeRenderLevel(
      { x: 99999, y: 99999 },
      { x: 0, y: 0, zoom: 1, width: 1920, height: 1080 },
    );
    expect(level).toBe('simplified');
  });
});

// ===== useBatchQueue =====

describe('useBatchQueue', () => {
  test('initial queueState is empty', () => {
    const { result } = renderHook(() =>
      useBatchQueue({
        executeTask: jest.fn().mockResolvedValue('task-1'),
      }),
    );

    expect(result.current.queueState.items).toEqual([]);
    expect(result.current.queueState.isRunning).toBe(false);
    expect(result.current.queueState.totalCount).toBe(0);
  });

  test('enqueue adds generator nodes to queue', () => {
    const { result } = renderHook(() =>
      useBatchQueue({
        executeTask: jest.fn().mockResolvedValue('task-1'),
      }),
    );

    const nodes = [
      makeNode('g1', 'generatorNode'),
      makeNode('t1', 'textNoteNode'),
    ];

    act(() => {
      result.current.enqueue(['g1', 't1'], nodes, []);
    });

    // Only generator nodes should be enqueued
    expect(result.current.queueState.items).toHaveLength(1);
    expect(result.current.queueState.items[0].nodeId).toBe('g1');
    expect(result.current.queueState.items[0].status).toBe('pending');
  });

  test('stopAll cancels pending items', () => {
    const { result } = renderHook(() =>
      useBatchQueue({
        executeTask: jest.fn().mockResolvedValue('task-1'),
      }),
    );

    const nodes = [makeNode('g1', 'generatorNode'), makeNode('g2', 'generatorNode')];

    act(() => {
      result.current.enqueue(['g1', 'g2'], nodes, []);
    });

    act(() => {
      result.current.stopAll();
    });

    for (const item of result.current.queueState.items) {
      expect(item.status).toBe('canceled');
    }
  });
});
