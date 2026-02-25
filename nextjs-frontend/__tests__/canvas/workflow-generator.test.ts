import type { StoryboardItem } from '../../lib/canvas/types';
import {
  createStoryboardNodesFromSlicerOutput,
  generateFullWorkflow,
  type EpisodeData,
} from '../../lib/canvas/workflow-generator';

// ===== createStoryboardNodesFromSlicerOutput =====

describe('createStoryboardNodesFromSlicerOutput', () => {
  test('returns empty arrays for empty storyboard items', () => {
    const result = createStoryboardNodesFromSlicerOutput('slicer-1', [], { x: 0, y: 0 });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  test('returns empty arrays for undefined storyboard items', () => {
    const result = createStoryboardNodesFromSlicerOutput(
      'slicer-1',
      undefined as unknown as StoryboardItem[],
      { x: 0, y: 0 },
    );
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  test('creates N storyboard nodes for N items', () => {
    const items: StoryboardItem[] = [
      { shotNumber: 1, sceneDescription: 'Scene A', dialogue: 'Hello' },
      { shotNumber: 2, sceneDescription: 'Scene B' },
      { shotNumber: 3, sceneDescription: 'Scene C', dialogue: 'Goodbye' },
    ];
    const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, { x: 100, y: 200 });

    expect(result.nodes).toHaveLength(3);
    // All nodes should be storyboardNode type
    for (const node of result.nodes) {
      expect(node.type).toBe('storyboardNode');
    }
  });

  test('storyboard node data matches input items', () => {
    const items: StoryboardItem[] = [
      { shotNumber: 5, sceneDescription: 'A dramatic scene', dialogue: 'Line 1' },
      { shotNumber: 6, sceneDescription: 'A quiet scene' },
    ];
    const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, { x: 0, y: 0 });

    const data0 = result.nodes[0].data as any;
    expect(data0.kind).toBe('storyboard');
    expect(data0.shotNumber).toBe(5);
    expect(data0.sceneDescription).toBe('A dramatic scene');
    expect(data0.dialogue).toBe('Line 1');

    const data1 = result.nodes[1].data as any;
    expect(data1.shotNumber).toBe(6);
    expect(data1.sceneDescription).toBe('A quiet scene');
    expect(data1.dialogue).toBeUndefined();
  });

  test('nodes are laid out horizontally with 250px spacing', () => {
    const items: StoryboardItem[] = [
      { shotNumber: 1, sceneDescription: 'A' },
      { shotNumber: 2, sceneDescription: 'B' },
      { shotNumber: 3, sceneDescription: 'C' },
    ];
    const startX = 50;
    const startY = 100;
    const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, { x: startX, y: startY });

    expect(result.nodes[0].position).toEqual({ x: 50, y: 100 });
    expect(result.nodes[1].position).toEqual({ x: 300, y: 100 }); // 50 + 250
    expect(result.nodes[2].position).toEqual({ x: 550, y: 100 }); // 50 + 500
  });

  test('each node has a unique ID', () => {
    const items: StoryboardItem[] = [
      { shotNumber: 1, sceneDescription: 'A' },
      { shotNumber: 2, sceneDescription: 'B' },
    ];
    const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, { x: 0, y: 0 });
    const ids = result.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ===== generateFullWorkflow =====

describe('generateFullWorkflow', () => {
  const baseEpisode: EpisodeData = {
    episodeId: 'ep-1',
    scriptText: 'Once upon a time...',
    storyboards: [
      { id: 'sb-1', shot_code: 'SC01-SH01', description: 'Opening shot', dialogue: 'Hello' },
      { id: 'sb-2', shot_code: 'SC01-SH02', description: 'Close-up' },
      { id: 'sb-3', shot_code: 'SC02-SH03', description: 'Wide shot', dialogue: 'Goodbye' },
    ],
  };

  test('creates correct number of nodes: 2 + 3*storyboards', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    // 1 script + 1 slicer + 3 storyboard + 3 generator + 3 preview = 11
    expect(result.nodes).toHaveLength(11);
  });

  test('creates correct node types', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const types = result.nodes.map((n) => n.type);
    expect(types.filter((t) => t === 'scriptNode')).toHaveLength(1);
    expect(types.filter((t) => t === 'slicerNode')).toHaveLength(1);
    expect(types.filter((t) => t === 'storyboardNode')).toHaveLength(3);
    expect(types.filter((t) => t === 'generatorNode')).toHaveLength(3);
    expect(types.filter((t) => t === 'previewNode')).toHaveLength(3);
  });

  test('creates correct number of edges', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    // 1 (script→slicer) + 3 (storyboard→generator) + 3 (generator→preview) = 7
    expect(result.edges).toHaveLength(7);
  });

  test('script node contains episode script text', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const scriptNode = result.nodes.find((n) => n.type === 'scriptNode');
    expect(scriptNode).toBeDefined();
    expect((scriptNode!.data as any).text).toBe('Once upon a time...');
  });

  test('storyboard nodes have correct data from episode storyboards', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const sbNodes = result.nodes.filter((n) => n.type === 'storyboardNode');
    expect(sbNodes).toHaveLength(3);

    const data0 = sbNodes[0].data as any;
    expect(data0.sceneDescription).toBe('Opening shot');
    expect(data0.dialogue).toBe('Hello');
    expect(data0.sourceStoryboardId).toBe('sb-1');
    expect(data0.episodeId).toBe('ep-1');

    const data1 = sbNodes[1].data as any;
    expect(data1.sceneDescription).toBe('Close-up');
    expect(data1.dialogue).toBeUndefined();
  });

  test('edges connect script→slicer with correct handles', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const scriptNode = result.nodes.find((n) => n.type === 'scriptNode')!;
    const slicerNode = result.nodes.find((n) => n.type === 'slicerNode')!;

    const scriptToSlicer = result.edges.find(
      (e) => e.source === scriptNode.id && e.target === slicerNode.id,
    );
    expect(scriptToSlicer).toBeDefined();
    expect(scriptToSlicer!.sourceHandle).toBe('text');
    expect(scriptToSlicer!.targetHandle).toBe('in-text');
  });

  test('edges connect storyboard→generator with correct handles', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const sbNodes = result.nodes.filter((n) => n.type === 'storyboardNode');
    const genNodes = result.nodes.filter((n) => n.type === 'generatorNode');

    for (let i = 0; i < sbNodes.length; i++) {
      const edge = result.edges.find(
        (e) => e.source === sbNodes[i].id && e.target === genNodes[i].id,
      );
      expect(edge).toBeDefined();
      expect(edge!.sourceHandle).toBe('out-desc');
      expect(edge!.targetHandle).toBe('in-script');
    }
  });

  test('edges connect generator→preview with correct handles', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const genNodes = result.nodes.filter((n) => n.type === 'generatorNode');
    const prevNodes = result.nodes.filter((n) => n.type === 'previewNode');

    for (let i = 0; i < genNodes.length; i++) {
      const edge = result.edges.find(
        (e) => e.source === genNodes[i].id && e.target === prevNodes[i].id,
      );
      expect(edge).toBeDefined();
      expect(edge!.sourceHandle).toBe('image');
      expect(edge!.targetHandle).toBe('in-image');
    }
  });

  test('layout: row 1 (script, slicer) at startY', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 100, y: 50 });
    const scriptNode = result.nodes.find((n) => n.type === 'scriptNode')!;
    const slicerNode = result.nodes.find((n) => n.type === 'slicerNode')!;

    expect(scriptNode.position.y).toBe(50);
    expect(slicerNode.position.y).toBe(50);
    expect(scriptNode.position.x).toBe(100);
    expect(slicerNode.position.x).toBe(400); // 100 + 300
  });

  test('layout: rows are spaced 200px apart vertically', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const sbNodes = result.nodes.filter((n) => n.type === 'storyboardNode');
    const genNodes = result.nodes.filter((n) => n.type === 'generatorNode');
    const prevNodes = result.nodes.filter((n) => n.type === 'previewNode');

    // Row 2 (storyboard) at y=200
    for (const n of sbNodes) expect(n.position.y).toBe(200);
    // Row 3 (generator) at y=400
    for (const n of genNodes) expect(n.position.y).toBe(400);
    // Row 4 (preview) at y=600
    for (const n of prevNodes) expect(n.position.y).toBe(600);
  });

  test('handles episode with no storyboards', () => {
    const result = generateFullWorkflow(
      { episodeId: 'ep-empty', storyboards: [] },
      { x: 0, y: 0 },
    );
    // Still creates script + slicer
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1); // script→slicer
  });

  test('handles episode with undefined storyboards', () => {
    const result = generateFullWorkflow(
      { episodeId: 'ep-undef' },
      { x: 0, y: 0 },
    );
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  test('all node IDs are unique', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const ids = result.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all edge IDs are unique', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    const ids = result.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('edges use typedEdge type', () => {
    const result = generateFullWorkflow(baseEpisode, { x: 0, y: 0 });
    for (const edge of result.edges) {
      expect((edge as any).type).toBe('typedEdge');
    }
  });

  test('shot number extracted from shot_code', () => {
    const result = generateFullWorkflow(
      {
        episodeId: 'ep-1',
        storyboards: [
          { shot_code: 'SC01-SH05', description: 'Test' },
          { shot_code: 'SH12', description: 'Test2' },
        ],
      },
      { x: 0, y: 0 },
    );
    const sbNodes = result.nodes.filter((n) => n.type === 'storyboardNode');
    expect((sbNodes[0].data as any).shotNumber).toBe(5);
    expect((sbNodes[1].data as any).shotNumber).toBe(12);
  });
});
