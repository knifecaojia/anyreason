/**
 * Property-Based Tests for storyboard fusion (workflow-generator.ts)
 *
 * Uses fast-check to verify universal properties of storyboard node creation
 * from slicer output. Each property maps to a correctness property from the
 * design document.
 */
import * as fc from 'fast-check';
import type { StoryboardItem } from '../../lib/canvas/types';
import { createStoryboardNodesFromSlicerOutput } from '../../lib/canvas/workflow-generator';

// Ensure node types are registered
import '../../lib/canvas/node-registry';

// ===== Arbitraries =====

/** Generate a valid StoryboardItem */
const arbStoryboardItem: fc.Arbitrary<StoryboardItem> = fc.record({
  shotNumber: fc.integer({ min: 1, max: 9999 }),
  sceneDescription: fc.string({ minLength: 1, maxLength: 200 }),
  dialogue: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

/** Generate a start position */
const arbPosition = fc.record({
  x: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
});

// ===== Property 15: 分镜列表自动创建节点数量 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 15: Storyboard list auto-creates correct node count', () => {
  /**
   * Property 15: 分镜列表自动创建节点数量
   * For any list of N StoryboardItems (N >= 0), createStoryboardNodesFromSlicerOutput
   * should produce exactly N storyboard nodes, each node's data should match the
   * corresponding input item, all node IDs should be unique, and nodes should be
   * laid out horizontally with 250px spacing.
   *
   * **Validates: Requirements 4.3**
   */

  it('produces exactly N nodes for N storyboard items', () => {
    fc.assert(
      fc.property(
        fc.array(arbStoryboardItem, { minLength: 0, maxLength: 20 }),
        arbPosition,
        (items, startPos) => {
          const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, startPos);
          expect(result.nodes).toHaveLength(items.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each node data matches the corresponding input item (shotNumber, sceneDescription, dialogue)', () => {
    fc.assert(
      fc.property(
        fc.array(arbStoryboardItem, { minLength: 1, maxLength: 15 }),
        arbPosition,
        (items, startPos) => {
          const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, startPos);

          for (let i = 0; i < items.length; i++) {
            const nodeData = result.nodes[i].data as any;
            expect(nodeData.shotNumber).toBe(items[i].shotNumber);
            expect(nodeData.sceneDescription).toBe(items[i].sceneDescription);
            expect(nodeData.dialogue).toBe(items[i].dialogue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all node IDs are unique', () => {
    fc.assert(
      fc.property(
        fc.array(arbStoryboardItem, { minLength: 2, maxLength: 20 }),
        arbPosition,
        (items, startPos) => {
          const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, startPos);
          const ids = result.nodes.map((n) => n.id);
          expect(new Set(ids).size).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('nodes are laid out horizontally with 250px spacing', () => {
    fc.assert(
      fc.property(
        fc.array(arbStoryboardItem, { minLength: 1, maxLength: 15 }),
        arbPosition,
        (items, startPos) => {
          const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, startPos);

          for (let i = 0; i < result.nodes.length; i++) {
            expect(result.nodes[i].position.x).toBeCloseTo(startPos.x + i * 250, 5);
            expect(result.nodes[i].position.y).toBeCloseTo(startPos.y, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all nodes have type storyboardNode', () => {
    fc.assert(
      fc.property(
        fc.array(arbStoryboardItem, { minLength: 1, maxLength: 15 }),
        arbPosition,
        (items, startPos) => {
          const result = createStoryboardNodesFromSlicerOutput('slicer-1', items, startPos);

          for (const node of result.nodes) {
            expect(node.type).toBe('storyboardNode');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
