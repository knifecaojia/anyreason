/**
 * Property-Based Tests for undo-redo.ts
 *
 * Uses fast-check to verify universal properties of the UndoRedoManager.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import type { CanvasState } from '../../lib/canvas/types';
import { UndoRedoManager } from '../../lib/canvas/undo-redo';

// ===== Helpers =====

/** Generate a CanvasState with the given node IDs */
function makeState(nodeIds: string[], edgeIds: string[] = []): CanvasState {
  return {
    nodes: nodeIds.map(
      (id) => ({ id, type: 'textNoteNode', position: { x: 0, y: 0 }, data: {} }) as Node,
    ),
    edges: edgeIds.map((id) => ({ id, source: 'a', target: 'b' }) as Edge),
  };
}

/** Arbitrary that produces a CanvasState with 1-5 nodes */
const arbCanvasState: fc.Arbitrary<CanvasState> = fc
  .array(fc.uuid(), { minLength: 1, maxLength: 5 })
  .map((ids) => makeState(ids));

// ===== Property 17: 撤销/重做往返与栈限制 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 17: Undo/redo round-trip and stack limit', () => {
  /**
   * Property 17a: push→undo returns the pushed state
   *
   * For any canvas state, after pushing it onto the manager, calling undo()
   * should return that exact state.
   *
   * **Validates: Requirements 5.7**
   */
  it('push then undo returns the pushed state', () => {
    fc.assert(
      fc.property(arbCanvasState, arbCanvasState, (initial, pushed) => {
        const mgr = new UndoRedoManager();
        mgr.push(initial);
        mgr.push(pushed);

        const undone = mgr.undo();
        expect(undone).toBe(pushed);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 17b: undo→redo returns the undone state (round-trip)
   *
   * For any sequence of pushed states, performing undo then redo should
   * return the same state that undo returned (round-trip consistency).
   *
   * **Validates: Requirements 5.7**
   */
  it('undo then redo returns the undone state (round-trip)', () => {
    fc.assert(
      fc.property(
        fc.array(arbCanvasState, { minLength: 2, maxLength: 10 }),
        (states) => {
          const mgr = new UndoRedoManager();
          for (const s of states) {
            mgr.push(s);
          }

          // Undo the last state
          const undone = mgr.undo();
          expect(undone).not.toBeNull();

          // Redo should return the same state
          const redone = mgr.redo();
          expect(redone).toBe(undone);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 17c: After N pushes (N > 50), undo stack never exceeds 50
   *
   * For any number of push operations exceeding 50, the undo stack should
   * be capped at 50 entries.
   *
   * **Validates: Requirements 5.7**
   */
  it('undo stack never exceeds 50 entries after more than 50 pushes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 51, max: 120 }),
        (pushCount) => {
          const mgr = new UndoRedoManager();
          for (let i = 0; i < pushCount; i++) {
            mgr.push(makeState([`node-${i}`]));
          }

          // Count how many undos we can perform
          let undoCount = 0;
          while (mgr.canUndo) {
            mgr.undo();
            undoCount++;
          }

          expect(undoCount).toBeLessThanOrEqual(50);
          expect(undoCount).toBe(50);
        },
      ),
      { numRuns: 100 },
    );
  });
});
