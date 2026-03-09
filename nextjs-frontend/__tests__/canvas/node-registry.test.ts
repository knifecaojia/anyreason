import {
  getAllNodeTypes,
  getNodeType,
  getNodeTypesByGroup,
  buildReactFlowNodeTypes,
  type NodeGroup,
} from '../../lib/canvas/node-registry';

const ALL_NODE_TYPES = [
  'textNoteNode',
  'scriptNode',
  'storyboardNode',
  'textGenNode',
  'generatorNode',
  'slicerNode',
  'candidateNode',
  'assetNode',
] as const;

const GROUP_MAP: Record<NodeGroup, string[]> = {
  creation: ['textNoteNode', 'scriptNode', 'storyboardNode'],
  'ai-generation': ['textGenNode', 'generatorNode', 'slicerNode', 'candidateNode'],
  reference: ['assetNode'],
};

describe('node-registry', () => {
  test('registers all node types', () => {
    const all = getAllNodeTypes();
    expect(all.size).toBe(ALL_NODE_TYPES.length);
    for (const t of ALL_NODE_TYPES) {
      expect(all.has(t)).toBe(true);
    }
  });

  test('getNodeType returns correct registration for each type', () => {
    for (const t of ALL_NODE_TYPES) {
      const reg = getNodeType(t);
      expect(reg).toBeDefined();
      expect(reg!.type).toBe(t);
      expect(typeof reg!.label).toBe('string');
      expect(typeof reg!.defaultData).toBe('function');
      expect(Array.isArray(reg!.ports)).toBe(true);
    }
  });

  test('getNodeType returns undefined for unknown type', () => {
    expect(getNodeType('unknownNode')).toBeUndefined();
  });

  test('group assignments match the spec', () => {
    for (const [group, types] of Object.entries(GROUP_MAP)) {
      const result = getNodeTypesByGroup(group as NodeGroup);
      const resultTypes = result.map((r) => r.type).sort();
      expect(resultTypes).toEqual([...types].sort());
    }
  });

  test('every node belongs to exactly one group', () => {
    const allGroups: NodeGroup[] = ['creation', 'ai-generation', 'reference'];
    for (const t of ALL_NODE_TYPES) {
      const reg = getNodeType(t)!;
      expect(allGroups).toContain(reg.group);
      // Verify it only appears in one group
      const matchingGroups = allGroups.filter((g) =>
        getNodeTypesByGroup(g).some((r) => r.type === t)
      );
      expect(matchingGroups).toHaveLength(1);
    }
  });

  test('defaultData factories return fresh objects with correct kind', () => {
    const kindMap: Record<string, string> = {
      textNoteNode: 'text-note',
      scriptNode: 'script',
      storyboardNode: 'storyboard',
      textGenNode: 'text-gen',
      generatorNode: 'generator',
      slicerNode: 'slicer',
      candidateNode: 'candidate',
      assetNode: 'asset',
    };

    for (const t of ALL_NODE_TYPES) {
      const reg = getNodeType(t)!;
      const data1 = reg.defaultData();
      const data2 = reg.defaultData();
      // Each call returns a new object
      expect(data1).not.toBe(data2);
      // Has correct kind discriminator
      expect(data1.kind).toBe(kindMap[t]);
    }
  });

  test('buildReactFlowNodeTypes returns a record with all 8 types', () => {
    const nodeTypes = buildReactFlowNodeTypes();
    expect(Object.keys(nodeTypes).sort()).toEqual([...ALL_NODE_TYPES].sort());
    for (const t of ALL_NODE_TYPES) {
      expect(typeof nodeTypes[t]).toBe('function');
    }
  });

  test('port definitions match the design spec', () => {
    // textNoteNode: no ports
    expect(getNodeType('textNoteNode')!.ports).toHaveLength(0);

    // scriptNode: 1 output (text)
    const scriptPorts = getNodeType('scriptNode')!.ports;
    expect(scriptPorts).toHaveLength(1);
    expect(scriptPorts[0]).toMatchObject({ direction: 'output', dataType: 'text' });

    // storyboardNode: 2 inputs (image, asset-ref), 1 output (text)
    const sbPorts = getNodeType('storyboardNode')!.ports;
    expect(sbPorts).toHaveLength(3);
    expect(sbPorts.filter((p) => p.direction === 'input')).toHaveLength(2);
    expect(sbPorts.filter((p) => p.direction === 'output')).toHaveLength(1);

    // textGenNode: 1 input (text), 1 output (text)
    const tgPorts = getNodeType('textGenNode')!.ports;
    expect(tgPorts).toHaveLength(2);
    expect(tgPorts.filter((p) => p.direction === 'input')).toHaveLength(1);
    expect(tgPorts.filter((p) => p.direction === 'output')).toHaveLength(1);

    // generatorNode: 2 inputs (text, asset-ref), 1 output (image)
    const genPorts = getNodeType('generatorNode')!.ports;
    expect(genPorts).toHaveLength(3);
    expect(genPorts.filter((p) => p.direction === 'input')).toHaveLength(2);
    expect(genPorts.filter((p) => p.direction === 'output')).toHaveLength(1);

    // slicerNode: 1 input (text), 1 output (storyboard-list)
    const slicerPorts = getNodeType('slicerNode')!.ports;
    expect(slicerPorts).toHaveLength(2);
    expect(slicerPorts.find((p) => p.direction === 'output')!.dataType).toBe('storyboard-list');

    // candidateNode: 1 input (text), no output
    const candPorts = getNodeType('candidateNode')!.ports;
    expect(candPorts).toHaveLength(1);
    expect(candPorts[0].direction).toBe('input');

    // assetNode: 1 output (asset-ref)
    const assetPorts = getNodeType('assetNode')!.ports;
    expect(assetPorts).toHaveLength(1);
    expect(assetPorts[0]).toMatchObject({ direction: 'output', dataType: 'asset-ref' });
  });
});
