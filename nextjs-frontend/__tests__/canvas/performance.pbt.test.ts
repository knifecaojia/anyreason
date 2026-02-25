/**
 * Property-Based Tests for performance.ts
 *
 * Uses fast-check to verify universal properties of the PerformanceModeManager.
 * Each property maps to a correctness property from the design document.
 *
 * Feature: infinite-canvas-storyboard-fusion, Property 16: 性能模式渲染级别
 */
import * as fc from 'fast-check';
import type { PerformanceMode } from '../../lib/canvas/types';
import {
  PerformanceModeManager,
  type Viewport,
  type RenderLevel,
} from '../../lib/canvas/performance';

// ===== Generators =====

const arbPosition = fc.record({
  x: fc.double({ min: -10000, max: 10000, noNaN: true }),
  y: fc.double({ min: -10000, max: 10000, noNaN: true }),
});

const arbViewport = fc.record({
  x: fc.double({ min: -5000, max: 5000, noNaN: true }),
  y: fc.double({ min: -5000, max: 5000, noNaN: true }),
  zoom: fc.double({ min: 0.01, max: 10, noNaN: true }),
  width: fc.constant(1920),
  height: fc.constant(1080),
});

const arbPerformanceMode: fc.Arbitrary<PerformanceMode> = fc.constantFrom(
  'high-quality' as PerformanceMode,
  'normal' as PerformanceMode,
  'fast' as PerformanceMode,
);

// ===== Property 16: 性能模式渲染级别 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 16: 性能模式渲染级别', () => {
  const mgr = new PerformanceModeManager();

  /**
   * Property 16a: high-quality mode always returns 'full'
   *
   * For any node position and viewport state, getNodeRenderLevel in
   * high-quality mode should always return 'full'.
   *
   * **Validates: Requirements 5.1**
   */
  it('high-quality mode: all nodes return full regardless of position and viewport', () => {
    fc.assert(
      fc.property(arbPosition, arbViewport, (position, viewport) => {
        const level = mgr.getNodeRenderLevel(position, viewport, 'high-quality');
        expect(level).toBe('full');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 16b: normal mode — viewport nodes return 'full', outside return 'simplified'
   *
   * For any node position and viewport, in normal mode:
   * - nodes inside viewport → 'full'
   * - nodes outside viewport (zoom >= 0.3) → 'simplified'
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  it('normal mode: viewport nodes return full, outside viewport return simplified (zoom >= 0.3)', () => {
    const arbNormalZoomViewport = fc.record({
      x: fc.double({ min: -5000, max: 5000, noNaN: true }),
      y: fc.double({ min: -5000, max: 5000, noNaN: true }),
      zoom: fc.double({ min: 0.3, max: 10, noNaN: true }),
      width: fc.constant(1920),
      height: fc.constant(1080),
    });

    fc.assert(
      fc.property(arbPosition, arbNormalZoomViewport, (position, viewport) => {
        const level = mgr.getNodeRenderLevel(position, viewport, 'normal');
        const inViewport = mgr.isInViewport(position, viewport);

        if (inViewport) {
          expect(level).toBe('full');
        } else {
          expect(level).toBe('simplified');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 16c: fast mode — viewport nodes return 'full', outside return 'placeholder'
   *
   * For any node position and viewport, in fast mode:
   * - nodes inside viewport → 'full'
   * - nodes outside viewport → 'placeholder'
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  it('fast mode: viewport nodes return full, outside viewport return placeholder', () => {
    fc.assert(
      fc.property(arbPosition, arbViewport, (position, viewport) => {
        const level = mgr.getNodeRenderLevel(position, viewport, 'fast');
        const inViewport = mgr.isInViewport(position, viewport);

        if (inViewport) {
          expect(level).toBe('full');
        } else {
          expect(level).toBe('placeholder');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 16d: zoom < 0.3 override — outside viewport nodes always return 'placeholder'
   *
   * For any node position outside the viewport and any non-high-quality mode,
   * when zoom < 0.3, getNodeRenderLevel should return 'placeholder'.
   *
   * **Validates: Requirements 5.8**
   */
  it('zoom < 0.3: outside viewport nodes return placeholder regardless of mode', () => {
    const arbLowZoomViewport = fc.record({
      x: fc.double({ min: -5000, max: 5000, noNaN: true }),
      y: fc.double({ min: -5000, max: 5000, noNaN: true }),
      zoom: fc.double({ min: 0.01, max: 0.29, noNaN: true }),
      width: fc.constant(1920),
      height: fc.constant(1080),
    });

    const arbNonHighQualityMode: fc.Arbitrary<PerformanceMode> = fc.constantFrom(
      'normal' as PerformanceMode,
      'fast' as PerformanceMode,
    );

    fc.assert(
      fc.property(
        arbPosition,
        arbLowZoomViewport,
        arbNonHighQualityMode,
        (position, viewport, mode) => {
          const inViewport = mgr.isInViewport(position, viewport);
          const level = mgr.getNodeRenderLevel(position, viewport, mode);

          if (!inViewport) {
            expect(level).toBe('placeholder');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 16e: viewport nodes always return 'full' in any mode
   *
   * For any node position inside the viewport and any performance mode,
   * getNodeRenderLevel should return 'full'.
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  it('viewport nodes always return full in any mode', () => {
    fc.assert(
      fc.property(arbPosition, arbViewport, arbPerformanceMode, (position, viewport, mode) => {
        const inViewport = mgr.isInViewport(position, viewport);
        if (inViewport) {
          const level = mgr.getNodeRenderLevel(position, viewport, mode);
          expect(level).toBe('full');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 16f: suggestMode returns 'normal' when nodeCount > 50, null otherwise
   *
   * For any non-negative integer nodeCount, suggestMode should return
   * 'normal' when nodeCount > 50 and null otherwise.
   *
   * **Validates: Requirements 5.8**
   */
  it('suggestMode returns normal when nodeCount > 50, null otherwise', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (nodeCount) => {
        const suggestion = mgr.suggestMode(nodeCount);
        if (nodeCount > 50) {
          expect(suggestion).toBe('normal');
        } else {
          expect(suggestion).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
