import type { CanvasState } from './types';

const MAX_HISTORY = 50;

/**
 * Manages undo/redo history for canvas states.
 *
 * - push() records a new state, clears the redo stack, and trims to 50 entries.
 * - undo() pops the most recent state from the undo stack and pushes the
 *   supplied "current" state onto the redo stack.
 * - redo() pops from the redo stack and pushes the supplied "current" state
 *   onto the undo stack.
 */
export class UndoRedoManager {
  private undoStack: CanvasState[] = [];
  private redoStack: CanvasState[] = [];

  /** Whether there is at least one state to undo to. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there is at least one state to redo to. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Record a canvas state. Clears the redo stack and trims the undo stack
   * to a maximum of {@link MAX_HISTORY} entries.
   */
  push(state: CanvasState): void {
    this.undoStack.push(state);
    this.redoStack = [];

    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack = this.undoStack.slice(this.undoStack.length - MAX_HISTORY);
    }
  }

  /**
   * Pop the most recent state from the undo stack.
   * Returns `null` when there is nothing to undo.
   */
  undo(): CanvasState | null {
    if (this.undoStack.length === 0) return null;
    const state = this.undoStack.pop()!;
    this.redoStack.push(state);
    return state;
  }

  /**
   * Pop the most recent state from the redo stack.
   * Returns `null` when there is nothing to redo.
   */
  redo(): CanvasState | null {
    if (this.redoStack.length === 0) return null;
    const state = this.redoStack.pop()!;
    this.undoStack.push(state);
    return state;
  }
}
