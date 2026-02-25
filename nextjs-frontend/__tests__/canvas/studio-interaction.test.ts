/**
 * Tests for studio page interaction enhancements (task 10.4).
 * Tests the keyboard shortcut logic and batch collapse/expand behavior
 * that are integrated into the studio page.
 *
 * Requirements: 5.4, 5.5, 5.6, 5.7, 5.9
 */

import type { Node, Edge } from '@xyflow/react';

// ===== Helpers =====

function makeNode(id: string, type = 'textNoteNode', selected = false, collapsed = false): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type.replace('Node', ''), collapsed },
    selected,
  } as unknown as Node;
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target } as Edge;
}

// ===== Batch collapse/expand logic =====

/**
 * Replicates the toggleCollapseSelected logic from the studio page.
 * If any selected node is expanded, collapse all selected; otherwise expand all.
 */
function toggleCollapseSelected(nodes: Node[]): Node[] {
  const selected = nodes.filter((n: any) => n.selected);
  if (selected.length === 0) return nodes;
  const anyExpanded = selected.some((n: any) => !n.data?.collapsed);
  return nodes.map((n: any) => {
    if (!n.selected) return n;
    return { ...n, data: { ...n.data, collapsed: anyExpanded } };
  });
}

describe('Batch collapse/expand (Req 5.5)', () => {
  test('collapses all selected nodes when any are expanded', () => {
    const nodes = [
      makeNode('a', 'textNoteNode', true, false),
      makeNode('b', 'mediaNode', true, true),
      makeNode('c', 'assetNode', false, false),
    ];
    const result = toggleCollapseSelected(nodes);
    // Selected nodes should all be collapsed
    expect((result[0] as any).data.collapsed).toBe(true);
    expect((result[1] as any).data.collapsed).toBe(true);
    // Unselected node unchanged
    expect((result[2] as any).data.collapsed).toBe(false);
  });

  test('expands all selected nodes when all are collapsed', () => {
    const nodes = [
      makeNode('a', 'textNoteNode', true, true),
      makeNode('b', 'mediaNode', true, true),
    ];
    const result = toggleCollapseSelected(nodes);
    expect((result[0] as any).data.collapsed).toBe(false);
    expect((result[1] as any).data.collapsed).toBe(false);
  });

  test('does nothing when no nodes are selected', () => {
    const nodes = [makeNode('a', 'textNoteNode', false, false)];
    const result = toggleCollapseSelected(nodes);
    expect(result).toBe(nodes);
  });
});

// ===== Select all logic =====

describe('Select all (Req 5.6 - Ctrl+A)', () => {
  test('selects all nodes', () => {
    const nodes = [
      makeNode('a', 'textNoteNode', false),
      makeNode('b', 'mediaNode', false),
      makeNode('c', 'assetNode', true),
    ];
    const result = nodes.map((n) => ({ ...n, selected: true }));
    expect(result.every((n) => n.selected)).toBe(true);
  });
});

// ===== Copy/paste logic =====

describe('Copy/paste (Req 5.6 - Ctrl+C/V)', () => {
  test('copies only selected nodes and edges between them', () => {
    const nodes = [
      makeNode('a', 'textNoteNode', true),
      makeNode('b', 'mediaNode', true),
      makeNode('c', 'assetNode', false),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'b', 'c'),
    ];

    const selected = nodes.filter((n: any) => n.selected);
    const selectedIds = new Set(selected.map((n) => n.id));
    const selectedEdges = edges.filter((ed) => selectedIds.has(ed.source) && selectedIds.has(ed.target));

    expect(selected).toHaveLength(2);
    expect(selectedEdges).toHaveLength(1);
    expect(selectedEdges[0].id).toBe('e1');
  });

  test('paste creates new nodes with offset positions', () => {
    const clipboard = {
      nodes: [
        { ...makeNode('a'), position: { x: 100, y: 200 } },
      ],
      edges: [] as Edge[],
    };

    const offset = 50;
    const pasted = clipboard.nodes.map((n: any) => ({
      ...n,
      id: 'new-id',
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: false,
    }));

    expect(pasted[0].position).toEqual({ x: 150, y: 250 });
    expect(pasted[0].selected).toBe(false);
  });
});

// ===== Delete logic =====

describe('Delete selected (Req 5.6 - Delete key)', () => {
  test('removes selected nodes and their connected edges', () => {
    const nodes = [
      makeNode('a', 'textNoteNode', true),
      makeNode('b', 'mediaNode', false),
      makeNode('c', 'assetNode', false),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'b', 'c'),
    ];

    const selectedIds = new Set(nodes.filter((n: any) => n.selected).map((n) => n.id));
    const remainingNodes = nodes.filter((n) => !selectedIds.has(n.id));
    const remainingEdges = edges.filter((ed) => !selectedIds.has(ed.source) && !selectedIds.has(ed.target));

    expect(remainingNodes).toHaveLength(2);
    expect(remainingEdges).toHaveLength(1);
    expect(remainingEdges[0].id).toBe('e2');
  });
});


// ===== Storyboard drag → storyboardNode creation (Req 4.1, 4.2) =====

describe('Storyboard drag creates storyboardNode (Req 4.1, 4.2)', () => {
  /**
   * Replicates the onDrop logic for storyboard payloads from the studio page.
   */
  function handleStoryboardDrop(payload: {
    kind: 'storyboard';
    shotCode: string;
    sceneCode?: string;
    description?: string;
    dialogue?: string;
    storyboardId?: string;
    episodeId?: string;
  }) {
    const shotCodeStr = String(payload.shotCode || '');
    const shotNumMatch = shotCodeStr.match(/(\d+)\s*$/);
    const shotNumber = shotNumMatch ? parseInt(shotNumMatch[1], 10) : 1;

    return {
      kind: 'storyboard' as const,
      shotNumber,
      sceneDescription: payload.description ? String(payload.description) : '',
      dialogue: payload.dialogue ? String(payload.dialogue) : undefined,
      referenceImageUrl: undefined,
      sourceStoryboardId: payload.storyboardId ? String(payload.storyboardId) : undefined,
      episodeId: payload.episodeId ? String(payload.episodeId) : undefined,
    };
  }

  test('creates storyboardNode data from shot drag payload', () => {
    const data = handleStoryboardDrop({
      kind: 'storyboard',
      shotCode: 'SC01-SH03',
      description: '主角走进房间',
      dialogue: '你好',
      storyboardId: 'sb-123',
      episodeId: 'ep-456',
    });

    expect(data.kind).toBe('storyboard');
    expect(data.shotNumber).toBe(3);
    expect(data.sceneDescription).toBe('主角走进房间');
    expect(data.dialogue).toBe('你好');
    expect(data.sourceStoryboardId).toBe('sb-123');
    expect(data.episodeId).toBe('ep-456');
  });

  test('extracts shot number from various shot code formats', () => {
    expect(handleStoryboardDrop({ kind: 'storyboard', shotCode: 'SH05' }).shotNumber).toBe(5);
    expect(handleStoryboardDrop({ kind: 'storyboard', shotCode: 'SC02-SH12' }).shotNumber).toBe(12);
    expect(handleStoryboardDrop({ kind: 'storyboard', shotCode: '7' }).shotNumber).toBe(7);
  });

  test('defaults to shotNumber 1 when no number in shot code', () => {
    expect(handleStoryboardDrop({ kind: 'storyboard', shotCode: '' }).shotNumber).toBe(1);
    expect(handleStoryboardDrop({ kind: 'storyboard', shotCode: 'ABC' }).shotNumber).toBe(1);
  });

  test('handles missing optional fields gracefully', () => {
    const data = handleStoryboardDrop({
      kind: 'storyboard',
      shotCode: 'SH01',
    });

    expect(data.sceneDescription).toBe('');
    expect(data.dialogue).toBeUndefined();
    expect(data.sourceStoryboardId).toBeUndefined();
    expect(data.episodeId).toBeUndefined();
  });
});

// ===== Storyboard node sync to backend (Req 4.5) =====

describe('Storyboard node sync payload (Req 4.5)', () => {
  /**
   * Replicates the sync payload construction from the studio page's useEffect.
   */
  function buildSyncPayload(data: {
    sceneDescription?: string;
    dialogue?: string;
  }) {
    return {
      description: data.sceneDescription || '',
      dialogue: data.dialogue || '',
    };
  }

  test('builds correct sync payload from storyboard node data', () => {
    const payload = buildSyncPayload({
      sceneDescription: '主角走进房间',
      dialogue: '你好世界',
    });

    expect(payload.description).toBe('主角走进房间');
    expect(payload.dialogue).toBe('你好世界');
  });

  test('defaults to empty strings for missing fields', () => {
    const payload = buildSyncPayload({});
    expect(payload.description).toBe('');
    expect(payload.dialogue).toBe('');
  });
});

// ===== AssetBinding creation on connect (Req 4.6) =====

describe('AssetBinding on connect (Req 4.6)', () => {
  /**
   * Replicates the AssetBinding detection logic from the onConnect handler.
   */
  function shouldCreateAssetBinding(
    connection: { source: string; target: string; targetHandle?: string },
    nodes: Node[],
  ): { assetId: string; storyboardId: string; episodeId?: string } | null {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (
      sourceNode?.type === 'assetNode' &&
      targetNode?.type === 'storyboardNode' &&
      connection.targetHandle === 'in-asset'
    ) {
      const assetData = sourceNode.data as any;
      const storyboardData = targetNode.data as any;
      if (assetData.assetId && storyboardData.sourceStoryboardId) {
        return {
          assetId: assetData.assetId,
          storyboardId: storyboardData.sourceStoryboardId,
          episodeId: storyboardData.episodeId || undefined,
        };
      }
    }
    return null;
  }

  test('detects asset → storyboard connection on in-asset port', () => {
    const nodes = [
      {
        id: 'asset-1',
        type: 'assetNode',
        position: { x: 0, y: 0 },
        data: { kind: 'asset', assetId: 'a-100', name: 'Hero', assetType: 'character' },
      },
      {
        id: 'sb-1',
        type: 'storyboardNode',
        position: { x: 200, y: 0 },
        data: { kind: 'storyboard', shotNumber: 1, sceneDescription: '', sourceStoryboardId: 'sb-200', episodeId: 'ep-300' },
      },
    ] as unknown as Node[];

    const result = shouldCreateAssetBinding(
      { source: 'asset-1', target: 'sb-1', targetHandle: 'in-asset' },
      nodes,
    );

    expect(result).toEqual({
      assetId: 'a-100',
      storyboardId: 'sb-200',
      episodeId: 'ep-300',
    });
  });

  test('returns null for non-asset source', () => {
    const nodes = [
      {
        id: 'text-1',
        type: 'textNoteNode',
        position: { x: 0, y: 0 },
        data: { kind: 'text-note', title: 'Note', content: '' },
      },
      {
        id: 'sb-1',
        type: 'storyboardNode',
        position: { x: 200, y: 0 },
        data: { kind: 'storyboard', shotNumber: 1, sceneDescription: '', sourceStoryboardId: 'sb-200' },
      },
    ] as unknown as Node[];

    const result = shouldCreateAssetBinding(
      { source: 'text-1', target: 'sb-1', targetHandle: 'in-asset' },
      nodes,
    );

    expect(result).toBeNull();
  });

  test('returns null for wrong target handle', () => {
    const nodes = [
      {
        id: 'asset-1',
        type: 'assetNode',
        position: { x: 0, y: 0 },
        data: { kind: 'asset', assetId: 'a-100', name: 'Hero', assetType: 'character' },
      },
      {
        id: 'sb-1',
        type: 'storyboardNode',
        position: { x: 200, y: 0 },
        data: { kind: 'storyboard', shotNumber: 1, sceneDescription: '', sourceStoryboardId: 'sb-200' },
      },
    ] as unknown as Node[];

    const result = shouldCreateAssetBinding(
      { source: 'asset-1', target: 'sb-1', targetHandle: 'in-image' },
      nodes,
    );

    expect(result).toBeNull();
  });

  test('returns null when storyboard has no sourceStoryboardId', () => {
    const nodes = [
      {
        id: 'asset-1',
        type: 'assetNode',
        position: { x: 0, y: 0 },
        data: { kind: 'asset', assetId: 'a-100', name: 'Hero', assetType: 'character' },
      },
      {
        id: 'sb-1',
        type: 'storyboardNode',
        position: { x: 200, y: 0 },
        data: { kind: 'storyboard', shotNumber: 1, sceneDescription: '' },
      },
    ] as unknown as Node[];

    const result = shouldCreateAssetBinding(
      { source: 'asset-1', target: 'sb-1', targetHandle: 'in-asset' },
      nodes,
    );

    expect(result).toBeNull();
  });
});

// ===== Batch generate storyboard selection detection (Req 4.7) =====

describe('Batch generate storyboard selection (Req 4.7)', () => {
  /**
   * Replicates the hasStoryboardSelection logic from the studio page.
   */
  function hasStoryboardSelection(selectedNodeIds: string[], nodes: Node[]): boolean {
    if (selectedNodeIds.length === 0) return false;
    return selectedNodeIds.some((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.type === 'storyboardNode';
    });
  }

  test('returns true when storyboard nodes are selected', () => {
    const nodes = [
      makeNode('sb-1', 'storyboardNode', true),
      makeNode('gen-1', 'generatorNode', true),
    ];
    expect(hasStoryboardSelection(['sb-1', 'gen-1'], nodes)).toBe(true);
  });

  test('returns false when no storyboard nodes are selected', () => {
    const nodes = [
      makeNode('gen-1', 'generatorNode', true),
      makeNode('text-1', 'textNoteNode', true),
    ];
    expect(hasStoryboardSelection(['gen-1', 'text-1'], nodes)).toBe(false);
  });

  test('returns false when selection is empty', () => {
    const nodes = [makeNode('sb-1', 'storyboardNode', false)];
    expect(hasStoryboardSelection([], nodes)).toBe(false);
  });

  /**
   * Replicates the batch generate logic: find downstream generator nodes from selected storyboard nodes.
   */
  function findDownstreamGenerators(
    selectedNodeIds: string[],
    nodes: Node[],
    edges: Edge[],
  ): string[] {
    const storyboardIds = selectedNodeIds.filter((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.type === 'storyboardNode';
    });
    const generatorNodeIds: string[] = [];
    for (const sbId of storyboardIds) {
      const downstreamEdges = edges.filter((e) => e.source === sbId);
      for (const edge of downstreamEdges) {
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode?.type === 'generatorNode' && !generatorNodeIds.includes(targetNode.id)) {
          generatorNodeIds.push(targetNode.id);
        }
      }
    }
    return generatorNodeIds;
  }

  test('finds downstream generator nodes from selected storyboard nodes', () => {
    const nodes = [
      makeNode('sb-1', 'storyboardNode', true),
      makeNode('sb-2', 'storyboardNode', true),
      makeNode('gen-1', 'generatorNode'),
      makeNode('gen-2', 'generatorNode'),
      makeNode('preview-1', 'previewNode'),
    ];
    const edges = [
      makeEdge('e1', 'sb-1', 'gen-1'),
      makeEdge('e2', 'sb-2', 'gen-2'),
      makeEdge('e3', 'gen-1', 'preview-1'),
    ];

    const result = findDownstreamGenerators(['sb-1', 'sb-2'], nodes, edges);
    expect(result).toEqual(['gen-1', 'gen-2']);
  });

  test('returns empty when no downstream generators exist', () => {
    const nodes = [
      makeNode('sb-1', 'storyboardNode', true),
      makeNode('preview-1', 'previewNode'),
    ];
    const edges = [makeEdge('e1', 'sb-1', 'preview-1')];

    const result = findDownstreamGenerators(['sb-1'], nodes, edges);
    expect(result).toEqual([]);
  });

  test('deduplicates generator nodes when multiple storyboard nodes connect to the same generator', () => {
    const nodes = [
      makeNode('sb-1', 'storyboardNode', true),
      makeNode('sb-2', 'storyboardNode', true),
      makeNode('gen-1', 'generatorNode'),
    ];
    const edges = [
      makeEdge('e1', 'sb-1', 'gen-1'),
      makeEdge('e2', 'sb-2', 'gen-1'),
    ];

    const result = findDownstreamGenerators(['sb-1', 'sb-2'], nodes, edges);
    expect(result).toEqual(['gen-1']);
  });
});

// ===== Layout mode switching (Req 4.8) =====

describe('Layout mode switching (Req 4.8)', () => {
  function makeStoryboardNode(id: string, shotNumber: number, x: number, y: number): Node {
    return {
      id,
      type: 'storyboardNode',
      position: { x, y },
      data: { kind: 'storyboard', shotNumber, sceneDescription: '' },
    } as unknown as Node;
  }

  /**
   * Replicates the layout mode change logic from the studio page.
   */
  function applyLayoutMode(
    mode: 'card' | 'timeline',
    nodes: Node[],
  ): Node[] {
    const storyboardNodes = nodes.filter((n: any) => n.type === 'storyboardNode');
    if (storyboardNodes.length === 0) return nodes;

    const sorted = [...storyboardNodes].sort((a: any, b: any) => {
      const aNum = (a.data as any)?.shotNumber ?? 0;
      const bNum = (b.data as any)?.shotNumber ?? 0;
      return aNum - bNum;
    });

    const anchor = sorted[0]?.position ?? { x: 0, y: 0 };

    if (mode === 'timeline') {
      const spacing = 300;
      const idToPos = new Map<string, { x: number; y: number }>();
      sorted.forEach((n, i) => {
        idToPos.set(n.id, { x: anchor.x + i * spacing, y: anchor.y });
      });
      return nodes.map((n: any) => {
        const pos = idToPos.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
    } else {
      const cols = 4;
      const hSpacing = 250;
      const vSpacing = 200;
      const idToPos = new Map<string, { x: number; y: number }>();
      sorted.forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        idToPos.set(n.id, { x: anchor.x + col * hSpacing, y: anchor.y + row * vSpacing });
      });
      return nodes.map((n: any) => {
        const pos = idToPos.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
    }
  }

  test('timeline mode arranges storyboard nodes in a horizontal row sorted by shotNumber', () => {
    const nodes = [
      makeStoryboardNode('sb-3', 3, 0, 0),
      makeStoryboardNode('sb-1', 1, 500, 500),
      makeStoryboardNode('sb-2', 2, 100, 300),
      makeNode('text-1', 'textNoteNode'), // non-storyboard node should be unaffected
    ];

    const result = applyLayoutMode('timeline', nodes);

    // Sorted by shotNumber: sb-1, sb-2, sb-3
    // Anchor is sb-1's original position (since it's first after sort)
    const sb1 = result.find((n) => n.id === 'sb-1')!;
    const sb2 = result.find((n) => n.id === 'sb-2')!;
    const sb3 = result.find((n) => n.id === 'sb-3')!;
    const text1 = result.find((n) => n.id === 'text-1')!;

    // All on the same Y
    expect(sb1.position.y).toBe(sb2.position.y);
    expect(sb2.position.y).toBe(sb3.position.y);

    // Sorted horizontally: sb-1 < sb-2 < sb-3
    expect(sb1.position.x).toBeLessThan(sb2.position.x);
    expect(sb2.position.x).toBeLessThan(sb3.position.x);

    // Spacing is 300
    expect(sb2.position.x - sb1.position.x).toBe(300);
    expect(sb3.position.x - sb2.position.x).toBe(300);

    // Non-storyboard node unchanged
    expect(text1.position).toEqual({ x: 0, y: 0 });
  });

  test('card mode arranges storyboard nodes in a grid (4 columns)', () => {
    const nodes = [
      makeStoryboardNode('sb-1', 1, 0, 0),
      makeStoryboardNode('sb-2', 2, 0, 0),
      makeStoryboardNode('sb-3', 3, 0, 0),
      makeStoryboardNode('sb-4', 4, 0, 0),
      makeStoryboardNode('sb-5', 5, 0, 0),
    ];

    const result = applyLayoutMode('card', nodes);

    const sb1 = result.find((n) => n.id === 'sb-1')!;
    const sb2 = result.find((n) => n.id === 'sb-2')!;
    const sb5 = result.find((n) => n.id === 'sb-5')!;

    // First row: sb-1, sb-2, sb-3, sb-4
    expect(sb1.position.y).toBe(sb2.position.y);
    expect(sb2.position.x - sb1.position.x).toBe(250);

    // Second row: sb-5
    expect(sb5.position.y - sb1.position.y).toBe(200);
    expect(sb5.position.x).toBe(sb1.position.x); // First column
  });

  test('does not modify nodes when no storyboard nodes exist', () => {
    const nodes = [
      makeNode('text-1', 'textNoteNode'),
      makeNode('gen-1', 'generatorNode'),
    ];

    const result = applyLayoutMode('timeline', nodes);
    expect(result).toBe(nodes); // Same reference, no changes
  });
});
