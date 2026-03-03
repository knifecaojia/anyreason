'use client';

import { useCallback, useState } from 'react';
import type { RenderLevel } from '@/lib/canvas/performance';

/**
 * Hook to manage icon mode expand/collapse state for a canvas node.
 *
 * Canvas nodes default to 'full' (normal display).
 * Icon mode is only used for zoom < 0.3 performance optimization.
 * The "icon化" design applies to the LEFT SIDEBAR node palette, not canvas nodes.
 */
export function useNodeIconMode(initialLevel: RenderLevel = 'full') {
  const [manualLevel, setManualLevel] = useState<RenderLevel | null>(null);

  const expand = useCallback(() => setManualLevel('full'), []);
  const collapse = useCallback(() => setManualLevel('icon'), []);
  const reset = useCallback(() => setManualLevel(null), []);

  /** Resolved render level: manual override takes priority */
  const resolveLevel = useCallback(
    (autoLevel?: RenderLevel): RenderLevel => {
      if (manualLevel) return manualLevel;
      return autoLevel ?? initialLevel;
    },
    [manualLevel, initialLevel],
  );

  return { expand, collapse, reset, resolveLevel, manualLevel };
}
