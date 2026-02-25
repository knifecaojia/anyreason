'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { PerformanceMode } from '../lib/canvas/types';
import { PerformanceModeManager, type RenderLevel, type Viewport } from '../lib/canvas/performance';

export interface UsePerformanceModeReturn {
  /** Current performance mode. */
  mode: PerformanceMode;
  /** Set the performance mode. */
  setMode: (mode: PerformanceMode) => void;
  /** Get the render level for a node given its position and viewport. */
  getNodeRenderLevel: (
    nodePosition: { x: number; y: number },
    viewport: Viewport,
  ) => RenderLevel;
  /** Suggested mode based on node count, or null if no suggestion. */
  suggestedMode: PerformanceMode | null;
}

/**
 * Hook that wraps PerformanceModeManager, providing reactive mode state,
 * a stable getNodeRenderLevel callback, and a suggested mode based on node count.
 */
export function usePerformanceMode(nodeCount: number): UsePerformanceModeReturn {
  const managerRef = useRef(new PerformanceModeManager());
  const [mode, setModeState] = useState<PerformanceMode>(() => managerRef.current.mode);

  const setMode = useCallback((newMode: PerformanceMode) => {
    managerRef.current.setMode(newMode);
    setModeState(newMode);
  }, []);

  const getNodeRenderLevel = useCallback(
    (nodePosition: { x: number; y: number }, viewport: Viewport): RenderLevel => {
      return managerRef.current.getNodeRenderLevel(nodePosition, viewport, mode);
    },
    [mode],
  );

  const suggestedMode = useMemo(
    () => managerRef.current.suggestMode(nodeCount),
    [nodeCount],
  );

  return { mode, setMode, getNodeRenderLevel, suggestedMode };
}
