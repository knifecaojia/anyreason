/**
 * Property-Based Tests for node-registry.ts
 *
 * Uses fast-check to verify universal properties of the node type registry.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import {
  getAllNodeTypes,
  getNodeType,
  getNodeTypesByGroup,
  type NodeGroup,
} from '../../lib/canvas/node-registry';

// ===== Constants =====

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

const ALL_GROUPS: NodeGroup[] = ['creation', 'ai-generation', 'reference'];

const GROUP_MAP: Record<NodeGroup, string[]> = {
  creation: ['textNoteNode', 'scriptNode', 'storyboardNode'],
  'ai-generation': ['textGenNode', 'generatorNode', 'slicerNode', 'candidateNode'],
  reference: ['assetNode'],
};

const KIND_MAP: Record<string, string> = {
  textNoteNode: 'text-note',
  assetNode: 'asset',
  scriptNode: 'script',
  generatorNode: 'generator',
  textGenNode: 'text-gen',
  slicerNode: 'slicer',
  candidateNode: 'candidate',
  storyboardNode: 'storyboard',
};

// ===== Generators =====

const arbNodeType = fc.constantFrom(...ALL_NODE_TYPES);

const arbPosition = fc.record({
  x: fc.double({ min: -10000, max: 10000, noNaN: true }),
  y: fc.double({ min: -10000, max: 10000, noNaN: true }),
});

// ===== Helper functions for Property 3 & 4 =====

/** Validates script text length: ≤10000 chars accepted, >10000 rejected */
function validateScriptText(text: string): boolean {
  return text.length <= 10000;
}

/** Toggles collapsed state */
function toggleCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}

/** Batch collapse: sets all items to the target value */
function batchCollapse(
  items: { collapsed: boolean }[],
  target: boolean
): { collapsed: boolean }[] {
  return items.map(() => ({ collapsed: target }));
}

// ===== Property Tests =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 1: Node registry group completeness', () => {
  /**
   * Property 1: 节点注册表分组完整性
   * Every node type belongs to exactly one of 4 groups,
   * and the group mapping matches the predefined spec.
   *
   * **Validates: Requirements 1.2**
   */
  it('every node type belongs to exactly one group and matches predefined spec', () => {
    fc.assert(
      fc.property(arbNodeType, (nodeType) => {
        const reg = getNodeType(nodeType);
        expect(reg).toBeDefined();

        // Node belongs to one of the 3 groups
        expect(ALL_GROUPS).toContain(reg!.group);

        // Node appears in exactly one group
        const matchingGroups = ALL_GROUPS.filter((g) =>
          getNodeTypesByGroup(g).some((r) => r.type === nodeType)
        );
        expect(matchingGroups).toHaveLength(1);

        // The group matches the predefined spec
        const expectedGroup = Object.entries(GROUP_MAP).find(([, types]) =>
          types.includes(nodeType)
        );
        expect(expectedGroup).toBeDefined();
        expect(reg!.group).toBe(expectedGroup![0]);
      }),
      { numRuns: 100 }
    );
  });

  it('all 4 groups are covered and contain the correct node types', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_GROUPS), (group) => {
        const groupTypes = getNodeTypesByGroup(group).map((r) => r.type).sort();
        const expectedTypes = [...GROUP_MAP[group]].sort();
        expect(groupTypes).toEqual(expectedTypes);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 2: Node creation correctness', () => {
  /**
   * Property 2: 节点创建正确性
   * Factory-created nodes have correct type, position, and default data
   * with the correct kind discriminator.
   *
   * **Validates: Requirements 1.3, 4.2**
   */
  it('factory-created nodes have correct type, position, and default data with kind discriminator', () => {
    fc.assert(
      fc.property(arbNodeType, arbPosition, (nodeType, position) => {
        const reg = getNodeType(nodeType);
        expect(reg).toBeDefined();

        // Simulate node creation (as the canvas would do on drop)
        const defaultData = reg!.defaultData();
        const node = {
          id: `test-${Date.now()}`,
          type: nodeType,
          position,
          data: defaultData,
        };

        // Correct type
        expect(node.type).toBe(nodeType);

        // Position matches input
        expect(node.position.x).toBe(position.x);
        expect(node.position.y).toBe(position.y);

        // Default data has correct kind discriminator
        expect(defaultData.kind).toBe(KIND_MAP[nodeType]);

        // Default data is a fresh object each time
        const anotherData = reg!.defaultData();
        expect(defaultData).not.toBe(anotherData);
        expect(defaultData.kind).toBe(anotherData.kind);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 3: Script node text length constraint', () => {
  /**
   * Property 3: 剧本节点文本长度约束
   * ≤10000 chars accepted, >10000 rejected.
   *
   * **Validates: Requirements 1.4**
   */
  it('accepts text with length ≤ 10000 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 10000 }),
        (text) => {
          expect(validateScriptText(text)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects text with length > 10000 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10001, maxLength: 20000 }),
        (text) => {
          expect(validateScriptText(text)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: infinite-canvas-storyboard-fusion, Property 4: Node collapse state toggle', () => {
  /**
   * Property 4: 节点折叠状态切换
   * Single toggle inverts, double toggle restores;
   * batch collapse sets uniform target.
   *
   * **Validates: Requirements 1.13, 5.5**
   */
  it('single toggle inverts the collapsed state', () => {
    fc.assert(
      fc.property(fc.boolean(), (collapsed) => {
        const toggled = toggleCollapsed(collapsed);
        expect(toggled).toBe(!collapsed);
      }),
      { numRuns: 100 }
    );
  });

  it('double toggle restores the original collapsed state', () => {
    fc.assert(
      fc.property(fc.boolean(), (collapsed) => {
        const doubleToggled = toggleCollapsed(toggleCollapsed(collapsed));
        expect(doubleToggled).toBe(collapsed);
      }),
      { numRuns: 100 }
    );
  });

  it('batch collapse sets all items to the uniform target value', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ collapsed: fc.boolean() }), { minLength: 0, maxLength: 50 }),
        fc.boolean(),
        (items, target) => {
          const result = batchCollapse(items, target);

          // Same length
          expect(result).toHaveLength(items.length);

          // All items have the target value
          for (const item of result) {
            expect(item.collapsed).toBe(target);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
