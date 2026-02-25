import type { PerformanceMode } from '../../lib/canvas/types';
import {
  PerformanceModeManager,
  createPerformanceModeManager,
  type Viewport,
} from '../../lib/canvas/performance';

// ===== Helpers =====

function makeViewport(overrides: Partial<Viewport> = {}): Viewport {
  return { x: 0, y: 0, zoom: 1, width: 1920, height: 1080, ...overrides };
}

// ===== Constructor / initial state =====

describe('PerformanceModeManager initial state', () => {
  test('defaults to high-quality mode', () => {
    const mgr = new PerformanceModeManager();
    expect(mgr.mode).toBe('high-quality');
  });

  test('accepts a custom initial mode', () => {
    const mgr = new PerformanceModeManager('fast');
    expect(mgr.mode).toBe('fast');
  });
});

// ===== setMode =====

describe('PerformanceModeManager.setMode', () => {
  test('changes the current mode', () => {
    const mgr = new PerformanceModeManager();
    mgr.setMode('normal');
    expect(mgr.mode).toBe('normal');
    mgr.setMode('fast');
    expect(mgr.mode).toBe('fast');
    mgr.setMode('high-quality');
    expect(mgr.mode).toBe('high-quality');
  });
});

// ===== suggestMode =====

describe('PerformanceModeManager.suggestMode', () => {
  test('returns null when nodeCount <= 50', () => {
    const mgr = new PerformanceModeManager();
    expect(mgr.suggestMode(0)).toBeNull();
    expect(mgr.suggestMode(25)).toBeNull();
    expect(mgr.suggestMode(50)).toBeNull();
  });

  test('returns "normal" when nodeCount > 50', () => {
    const mgr = new PerformanceModeManager();
    expect(mgr.suggestMode(51)).toBe('normal');
    expect(mgr.suggestMode(100)).toBe('normal');
    expect(mgr.suggestMode(1000)).toBe('normal');
  });

  test('boundary: exactly 50 returns null, 51 returns normal', () => {
    const mgr = new PerformanceModeManager();
    expect(mgr.suggestMode(50)).toBeNull();
    expect(mgr.suggestMode(51)).toBe('normal');
  });
});

// ===== isInViewport =====

describe('PerformanceModeManager.isInViewport', () => {
  test('node at origin is in default viewport', () => {
    const mgr = new PerformanceModeManager();
    const vp = makeViewport();
    expect(mgr.isInViewport({ x: 0, y: 0 }, vp)).toBe(true);
  });

  test('node within viewport bounds returns true', () => {
    const mgr = new PerformanceModeManager();
    const vp = makeViewport();
    expect(mgr.isInViewport({ x: 500, y: 500 }, vp)).toBe(true);
  });

  test('node outside viewport returns false', () => {
    const mgr = new PerformanceModeManager();
    const vp = makeViewport();
    expect(mgr.isInViewport({ x: 5000, y: 5000 }, vp)).toBe(false);
  });

  test('node at negative position outside viewport returns false', () => {
    const mgr = new PerformanceModeManager();
    const vp = makeViewport();
    expect(mgr.isInViewport({ x: -100, y: -100 }, vp)).toBe(false);
  });

  test('zoom affects viewport calculation', () => {
    const mgr = new PerformanceModeManager();
    // With zoom=0.5, a node at x=3000 maps to screenX = 3000*0.5 + 0 = 1500, which is < 1920
    const vp = makeViewport({ zoom: 0.5 });
    expect(mgr.isInViewport({ x: 3000, y: 500 }, vp)).toBe(true);
    // With zoom=1, x=3000 maps to screenX = 3000, which is >= 1920
    const vp2 = makeViewport({ zoom: 1 });
    expect(mgr.isInViewport({ x: 3000, y: 500 }, vp2)).toBe(false);
  });

  test('viewport offset affects calculation', () => {
    const mgr = new PerformanceModeManager();
    // Viewport shifted left by 500px: node at x=2000 maps to screenX = 2000*1 + (-500) = 1500
    const vp = makeViewport({ x: -500 });
    expect(mgr.isInViewport({ x: 2000, y: 500 }, vp)).toBe(true);
  });

  test('uses default dimensions when width/height not provided', () => {
    const mgr = new PerformanceModeManager();
    const vp: Viewport = { x: 0, y: 0, zoom: 1 };
    // Should use 1920x1080 defaults
    expect(mgr.isInViewport({ x: 500, y: 500 }, vp)).toBe(true);
    expect(mgr.isInViewport({ x: 5000, y: 500 }, vp)).toBe(false);
  });
});

// ===== getNodeRenderLevel =====

describe('PerformanceModeManager.getNodeRenderLevel', () => {
  const mgr = new PerformanceModeManager();
  const insideVp = { x: 100, y: 100 };
  const outsideVp = { x: 5000, y: 5000 };
  const vp = makeViewport();

  describe('high-quality mode', () => {
    test('viewport node returns full', () => {
      expect(mgr.getNodeRenderLevel(insideVp, vp, 'high-quality')).toBe('full');
    });

    test('outside viewport node returns full', () => {
      expect(mgr.getNodeRenderLevel(outsideVp, vp, 'high-quality')).toBe('full');
    });
  });

  describe('normal mode', () => {
    test('viewport node returns full', () => {
      expect(mgr.getNodeRenderLevel(insideVp, vp, 'normal')).toBe('full');
    });

    test('outside viewport node returns simplified', () => {
      expect(mgr.getNodeRenderLevel(outsideVp, vp, 'normal')).toBe('simplified');
    });
  });

  describe('fast mode', () => {
    test('viewport node returns full', () => {
      expect(mgr.getNodeRenderLevel(insideVp, vp, 'fast')).toBe('full');
    });

    test('outside viewport node returns placeholder', () => {
      expect(mgr.getNodeRenderLevel(outsideVp, vp, 'fast')).toBe('placeholder');
    });
  });

  describe('zoom < 0.3 override', () => {
    const lowZoomVp = makeViewport({ zoom: 0.2 });
    // At zoom=0.2, need a node far enough that screenX = x*0.2 >= 1920 → x >= 9600
    const farOutside = { x: 15000, y: 15000 };

    test('normal mode: outside viewport returns placeholder (not simplified)', () => {
      expect(mgr.getNodeRenderLevel(farOutside, lowZoomVp, 'normal')).toBe('placeholder');
    });

    test('fast mode: outside viewport returns placeholder', () => {
      expect(mgr.getNodeRenderLevel(farOutside, lowZoomVp, 'fast')).toBe('placeholder');
    });

    test('high-quality mode: still returns full regardless of zoom', () => {
      expect(mgr.getNodeRenderLevel(farOutside, lowZoomVp, 'high-quality')).toBe('full');
    });

    test('viewport node still returns full even with low zoom', () => {
      // With zoom=0.2, node at (100,100) → screenX=20, screenY=20 → in viewport
      expect(mgr.getNodeRenderLevel(insideVp, lowZoomVp, 'normal')).toBe('full');
    });
  });

  describe('zoom = 0.3 boundary', () => {
    const boundaryVp = makeViewport({ zoom: 0.3 });

    test('zoom exactly 0.3: normal mode outside viewport returns simplified (not placeholder)', () => {
      expect(mgr.getNodeRenderLevel(outsideVp, boundaryVp, 'normal')).toBe('simplified');
    });

    test('zoom exactly 0.3: fast mode outside viewport returns placeholder', () => {
      expect(mgr.getNodeRenderLevel(outsideVp, boundaryVp, 'fast')).toBe('placeholder');
    });
  });
});

// ===== Factory function =====

describe('createPerformanceModeManager', () => {
  test('creates a manager with default mode', () => {
    const mgr = createPerformanceModeManager();
    expect(mgr.mode).toBe('high-quality');
    expect(mgr).toBeInstanceOf(PerformanceModeManager);
  });

  test('creates a manager with specified mode', () => {
    const mgr = createPerformanceModeManager('fast');
    expect(mgr.mode).toBe('fast');
  });
});
