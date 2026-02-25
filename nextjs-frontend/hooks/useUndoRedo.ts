'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { CanvasState } from '../lib/canvas/types';
import { UndoRedoManager } from '../lib/canvas/undo-redo';

export interface UseUndoRedoReturn {
  /** Push the current canvas state onto the undo stack. */
  push: (state: CanvasState) => void;
  /** Undo: restores the previous state. Returns null if nothing to undo. */
  undo: () => CanvasState | null;
  /** Redo: restores the state before the last undo. Returns null if nothing to redo. */
  redo: () => CanvasState | null;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
}

/**
 * Hook that wraps UndoRedoManager and binds Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts.
 *
 * @param setNodes - ReactFlow setNodes updater
 * @param setEdges - ReactFlow setEdges updater
 */
export function useUndoRedo(
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
): UseUndoRedoReturn {
  const managerRef = useRef(new UndoRedoManager());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Keep a ref to the latest setNodes/setEdges to avoid stale closures in the keydown handler
  const setNodesRef = useRef(setNodes);
  const setEdgesRef = useRef(setEdges);
  setNodesRef.current = setNodes;
  setEdgesRef.current = setEdges;

  const syncFlags = useCallback(() => {
    const mgr = managerRef.current;
    setCanUndo(mgr.canUndo);
    setCanRedo(mgr.canRedo);
  }, []);

  const push = useCallback(
    (state: CanvasState) => {
      managerRef.current.push(state);
      syncFlags();
    },
    [syncFlags],
  );

  const undo = useCallback((): CanvasState | null => {
    const state = managerRef.current.undo();
    syncFlags();
    if (state) {
      setNodesRef.current(state.nodes);
      setEdgesRef.current(state.edges);
    }
    return state;
  }, [syncFlags]);

  const redo = useCallback((): CanvasState | null => {
    const state = managerRef.current.redo();
    syncFlags();
    if (state) {
      setNodesRef.current(state.nodes);
      setEdgesRef.current(state.edges);
    }
    return state;
  }, [syncFlags]);

  // Bind keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z (redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          // Ctrl+Shift+Z → redo
          e.preventDefault();
          redo();
        } else {
          // Ctrl+Z → undo
          e.preventDefault();
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return { push, undo, redo, canUndo, canRedo };
}
