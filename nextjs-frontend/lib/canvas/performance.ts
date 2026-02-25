import type { PerformanceMode } from './types';

/**
 * Viewport definition for performance calculations.
 * Includes width/height for viewport bounds checking.
 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  width?: number;
  height?: number;
}

/** Rendering level for a node based on performance mode and viewport position */
export type RenderLevel = 'full' | 'simplified' | 'placeholder';

/**
 * PerformanceModeManager controls rendering quality based on
 * the current performance mode, viewport position, and zoom level.
 */
export class PerformanceModeManager {
  private _mode: PerformanceMode;

  constructor(initialMode: PerformanceMode = 'high-quality') {
    this._mode = initialMode;
  }

  get mode(): PerformanceMode {
    return this._mode;
  }

  setMode(mode: PerformanceMode): void {
    this._mode = mode;
  }

  /**
   * Suggest a performance mode based on node count.
   * Returns 'normal' when nodeCount > 50, null otherwise.
   */
  suggestMode(nodeCount: number): PerformanceMode | null {
    if (nodeCount > 50) {
      return 'normal';
    }
    return null;
  }

  /**
   * Check if a node position is within the current viewport bounds.
   * The viewport x/y represent the top-left corner offset (in screen coords),
   * and width/height represent the screen dimensions.
   * A node at canvas position (nx, ny) maps to screen position:
   *   screenX = nx * zoom + viewport.x
   *   screenY = ny * zoom + viewport.y
   * The node is in viewport if screenX/screenY fall within [0, width) x [0, height).
   */
  isInViewport(
    nodePosition: { x: number; y: number },
    viewport: Viewport
  ): boolean {
    const width = viewport.width ?? 1920;
    const height = viewport.height ?? 1080;

    const screenX = nodePosition.x * viewport.zoom + viewport.x;
    const screenY = nodePosition.y * viewport.zoom + viewport.y;

    return screenX >= 0 && screenX < width && screenY >= 0 && screenY < height;
  }

  /**
   * Get the rendering level for a node based on its position, viewport, and mode.
   *
   * Rules:
   * - high-quality mode: all nodes return 'full'
   * - normal mode: viewport nodes → 'full', outside → 'simplified'
   * - fast mode: viewport nodes → 'full', outside → 'placeholder'
   * - When zoom < 0.3: outside viewport nodes always return 'placeholder' regardless of mode
   */
  getNodeRenderLevel(
    nodePosition: { x: number; y: number },
    viewport: Viewport,
    mode: PerformanceMode
  ): RenderLevel {
    // high-quality mode: always full
    if (mode === 'high-quality') {
      return 'full';
    }

    const inViewport = this.isInViewport(nodePosition, viewport);

    // Viewport nodes are always 'full'
    if (inViewport) {
      return 'full';
    }

    // Outside viewport + zoom < 0.3: always placeholder regardless of mode
    if (viewport.zoom < 0.3) {
      return 'placeholder';
    }

    // Outside viewport, normal zoom
    if (mode === 'normal') {
      return 'simplified';
    }

    // mode === 'fast'
    return 'placeholder';
  }
}

/**
 * Factory function to create a PerformanceModeManager instance.
 */
export function createPerformanceModeManager(
  initialMode: PerformanceMode = 'high-quality'
): PerformanceModeManager {
  return new PerformanceModeManager(initialMode);
}
