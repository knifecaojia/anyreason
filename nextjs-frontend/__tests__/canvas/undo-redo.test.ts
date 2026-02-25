import type { Node, Edge } from '@xyflow/react';
import type { CanvasState } from '../../lib/canvas/types';
import { UndoRedoManager } from '../../lib/canvas/undo-redo';

// ===== Helpers =====

function makeState(nodeIds: string[], edgeIds: string[] = []): CanvasState {
  return {
    nodes: nodeIds.map((id) => ({ id, type: 'textNoteNode', position: { x: 0, y: 0 }, data: {} }) as Node),
    edges: edgeIds.map((id) => ({ id, source: 'a', target: 'b' }) as Edge),
  };
}

// ===== Constructor / initial state =====

describe('UndoRedoManager initial state', () => {
  test('canUndo and canRedo are false on a fresh instance', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.canUndo).toBe(false);
    expect(mgr.canRedo).toBe(false);
  });

  test('undo returns null when stack is empty', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.undo()).toBeNull();
  });

  test('redo returns null when stack is empty', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.redo()).toBeNull();
  });
});

// ===== push =====

describe('UndoRedoManager.push', () => {
  test('push makes canUndo true', () => {
    const mgr = new UndoRedoManager();
    mgr.push(makeState(['n1']));
    expect(mgr.canUndo).toBe(true);
    expect(mgr.canRedo).toBe(false);
  });

  test('push clears redo stack', () => {
    const mgr = new UndoRedoManager();
    mgr.push(makeState(['n1']));
    mgr.push(makeState(['n2']));
    mgr.undo(); // redo stack now has one entry
    expect(mgr.canRedo).toBe(true);

    mgr.push(makeState(['n3'])); // should clear redo
    expect(mgr.canRedo).toBe(false);
  });

  test('push trims undo stack to 50 entries', () => {
    const mgr = new UndoRedoManager();
    for (let i = 0; i < 60; i++) {
      mgr.push(makeState([`n${i}`]));
    }
    // After 60 pushes the stack should be capped at 50
    let count = 0;
    while (mgr.canUndo) {
      mgr.undo();
      count++;
    }
    expect(count).toBe(50);
  });
});

// ===== undo =====

describe('UndoRedoManager.undo', () => {
  test('undo returns the last pushed state', () => {
    const mgr = new UndoRedoManager();
    const s1 = makeState(['n1']);
    const s2 = makeState(['n2']);
    mgr.push(s1);
    mgr.push(s2);

    const result = mgr.undo();
    expect(result).toBe(s2);
  });

  test('undo moves state to redo stack', () => {
    const mgr = new UndoRedoManager();
    mgr.push(makeState(['n1']));
    mgr.undo();
    expect(mgr.canUndo).toBe(false);
    expect(mgr.canRedo).toBe(true);
  });

  test('multiple undos return states in reverse order', () => {
    const mgr = new UndoRedoManager();
    const s1 = makeState(['n1']);
    const s2 = makeState(['n2']);
    const s3 = makeState(['n3']);
    mgr.push(s1);
    mgr.push(s2);
    mgr.push(s3);

    expect(mgr.undo()).toBe(s3);
    expect(mgr.undo()).toBe(s2);
    expect(mgr.undo()).toBe(s1);
    expect(mgr.undo()).toBeNull();
  });
});

// ===== redo =====

describe('UndoRedoManager.redo', () => {
  test('redo returns the last undone state', () => {
    const mgr = new UndoRedoManager();
    const s1 = makeState(['n1']);
    mgr.push(s1);
    mgr.undo();

    const result = mgr.redo();
    expect(result).toBe(s1);
  });

  test('redo moves state back to undo stack', () => {
    const mgr = new UndoRedoManager();
    mgr.push(makeState(['n1']));
    mgr.undo();
    mgr.redo();
    expect(mgr.canUndo).toBe(true);
    expect(mgr.canRedo).toBe(false);
  });

  test('undo then redo round-trip preserves state identity', () => {
    const mgr = new UndoRedoManager();
    const s1 = makeState(['n1']);
    const s2 = makeState(['n2']);
    mgr.push(s1);
    mgr.push(s2);

    const undone = mgr.undo();
    const redone = mgr.redo();
    expect(redone).toBe(undone);
  });
});

// ===== edge cases =====

describe('UndoRedoManager edge cases', () => {
  test('redo after push returns null (redo cleared)', () => {
    const mgr = new UndoRedoManager();
    mgr.push(makeState(['n1']));
    mgr.push(makeState(['n2']));
    mgr.undo();
    mgr.push(makeState(['n3']));
    expect(mgr.redo()).toBeNull();
  });

  test('interleaved push/undo/redo sequence', () => {
    const mgr = new UndoRedoManager();
    const s1 = makeState(['n1']);
    const s2 = makeState(['n2']);
    const s3 = makeState(['n3']);

    mgr.push(s1);
    mgr.push(s2);
    expect(mgr.undo()).toBe(s2); // undo stack: [s1], redo: [s2]
    expect(mgr.undo()).toBe(s1); // undo stack: [], redo: [s2, s1]
    expect(mgr.redo()).toBe(s1); // undo stack: [s1], redo: [s2]
    mgr.push(s3);               // undo stack: [s1, s3], redo: []
    expect(mgr.canRedo).toBe(false);
    expect(mgr.undo()).toBe(s3);
    expect(mgr.undo()).toBe(s1);
    expect(mgr.undo()).toBeNull();
  });

  test('states with edges are preserved through undo/redo', () => {
    const mgr = new UndoRedoManager();
    const s = makeState(['n1', 'n2'], ['e1']);
    mgr.push(s);
    const undone = mgr.undo()!;
    expect(undone.edges).toHaveLength(1);
    expect(undone.edges[0].id).toBe('e1');
  });
});
