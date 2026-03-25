import type { CanvasState } from './types';

const MAX_HISTORY = 50;

/**
 * Manages undo/redo history for canvas states.
 *
 * - push(currentState) records the state BEFORE a change, clears redo stack.
 * - undo(currentState) restores the previous state, saves currentState to redo.
 * - redo(currentState) restores the next state, saves currentState to undo.
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
   * Record the state BEFORE a change happens.
   * Clears the redo stack and trims the undo stack to MAX_HISTORY.
   */
  push(state: CanvasState): void {
    this.undoStack.push(state);
    this.redoStack = [];

    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack = this.undoStack.slice(this.undoStack.length - MAX_HISTORY);
    }
  }

  /**
   * Undo: save current state to redo stack, restore previous state.
   * @param currentState - The state BEFORE undo (will be saved for redo)
   * Returns the state to restore, or null if nothing to undo.
   */
  undo(currentState: CanvasState): CanvasState | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(currentState);
    return this.undoStack.pop()!;
  }

  /**
   * Redo: save current state to undo stack, restore next state.
   * @param currentState - The state BEFORE redo (will be saved for undo)
   * Returns the state to restore, or null if nothing to redo.
   */
  redo(currentState: CanvasState): CanvasState | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(currentState);
    return this.redoStack.pop()!;
  }
}
