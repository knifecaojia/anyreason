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
 * @param getNodes - ReactFlow getNodes function
 * @param getEdges - ReactFlow getEdges function
 */
export function useUndoRedo(
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
  getNodes: () => Node[],
  getEdges: () => Edge[],
): UseUndoRedoReturn {
  const managerRef = useRef(new UndoRedoManager());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const setNodesRef = useRef(setNodes);
  const setEdgesRef = useRef(setEdges);
  const getNodesRef = useRef(getNodes);
  const getEdgesRef = useRef(getEdges);
  setNodesRef.current = setNodes;
  setEdgesRef.current = setEdges;
  getNodesRef.current = getNodes;
  getEdgesRef.current = getEdges;

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
    const currentState: CanvasState = {
      nodes: getNodesRef.current(),
      edges: getEdgesRef.current(),
    };
    const state = managerRef.current.undo(currentState);
    syncFlags();
    if (state) {
      setNodesRef.current(state.nodes);
      setEdgesRef.current(state.edges);
    }
    return state;
  }, [syncFlags]);

  const redo = useCallback((): CanvasState | null => {
    const currentState: CanvasState = {
      nodes: getNodesRef.current(),
      edges: getEdgesRef.current(),
    };
    const state = managerRef.current.redo(currentState);
    syncFlags();
    if (state) {
      setNodesRef.current(state.nodes);
      setEdgesRef.current(state.edges);
    }
    return state;
  }, [syncFlags]);

  // Bind keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
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
      } else if (e.key === 'y' || e.key === 'Y') {
        // Ctrl+Y → redo
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return { push, undo, redo, canUndo, canRedo };
}
