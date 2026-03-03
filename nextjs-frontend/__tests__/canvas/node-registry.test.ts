import {
  getAllNodeTypes,
  getNodeType,
  getNodeTypesByGroup,
  buildReactFlowNodeTypes,
  type NodeGroup,
} from '../../lib/canvas/node-registry';

const ALL_NODE_TYPES = [
  'textNoteNode',
  'assetNode',
  'scriptNode',
  'generatorNode',
  'textGenNode',
  'slicerNode',
  'candidateNode',
  'storyboardNode',
] as const;

const GROUP_MAP: Record<NodeGroup, string[]> = {
  creation: ['textNoteNode', 'scriptNode', 'storyboardNode'],
  'ai-generation': ['textGenNode', 'generatorNode', 'slicerNode', 'candidateNode'],
  reference: ['assetNode'],
};

describe('node-registry', () => {
  test('registers all 8 node types', () => {
    const all = getAllNodeTypes();
    expect(all.size).toBe(8);
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
      assetNode: 'asset',
      scriptNode: 'script',
      generatorNode: 'generator',
      textGenNode: 'text-gen',
      slicerNode: 'slicer',
      candidateNode: 'candidate',
      storyboardNode: 'storyboard',
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

  test('port definitions match the M1.2 design spec', () => {
    // textNoteNode: 1 output (out-text)
    const textNotePorts = getNodeType('textNoteNode')!.ports;
    expect(textNotePorts).toHaveLength(1);
    expect(textNotePorts[0]).toMatchObject({ id: 'out-text', direction: 'output', dataType: 'text' });

    // scriptNode: 1 output (out-text)
    const scriptPorts = getNodeType('scriptNode')!.ports;
    expect(scriptPorts).toHaveLength(1);
    expect(scriptPorts[0]).toMatchObject({ id: 'out-text', direction: 'output', dataType: 'text' });

    // storyboardNode: 2 inputs (in-image, in-asset), 2 outputs (out-text, out-ref)
    const sbPorts = getNodeType('storyboardNode')!.ports;
    expect(sbPorts).toHaveLength(4);
    expect(sbPorts.filter((p) => p.direction === 'input')).toHaveLength(2);
    expect(sbPorts.filter((p) => p.direction === 'output')).toHaveLength(2);

    // textGenNode: 2 inputs (in-text, in-ref), 1 output (out-text)
    const tgPorts = getNodeType('textGenNode')!.ports;
    expect(tgPorts).toHaveLength(3);
    expect(tgPorts.filter((p) => p.direction === 'input')).toHaveLength(2);
    expect(tgPorts.filter((p) => p.direction === 'output')).toHaveLength(1);

    // generatorNode: 2 inputs (in-text, in-ref), 2 outputs (out-image, out-video)
    const genPorts = getNodeType('generatorNode')!.ports;
    expect(genPorts).toHaveLength(4);
    expect(genPorts.filter((p) => p.direction === 'input')).toHaveLength(2);
    expect(genPorts.filter((p) => p.direction === 'output')).toHaveLength(2);

    // slicerNode: 1 input (in-text), 1 output (storyboard-list)
    const slicerPorts = getNodeType('slicerNode')!.ports;
    expect(slicerPorts).toHaveLength(2);
    expect(slicerPorts.find((p) => p.direction === 'output')!.dataType).toBe('storyboard-list');

    // candidateNode: 1 input (in-text), 1 output (out-refs)
    const candPorts = getNodeType('candidateNode')!.ports;
    expect(candPorts).toHaveLength(2);
    expect(candPorts.find((p) => p.id === 'out-refs')!.dataType).toBe('asset-ref');

    // assetNode: 1 output (out-ref)
    const assetPorts = getNodeType('assetNode')!.ports;
    expect(assetPorts).toHaveLength(1);
    expect(assetPorts[0]).toMatchObject({ id: 'out-ref', direction: 'output', dataType: 'asset-ref' });
  });
});
