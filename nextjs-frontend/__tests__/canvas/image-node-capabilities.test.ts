import {
  deriveImageCapabilityState,
} from '@/lib/canvas/image-model-capabilities';

describe('deriveImageCapabilityState', () => {
  test('falls back to model capability defaults when current ratio/resolution are invalid', () => {
    const result = deriveImageCapabilityState(
      {
        aspect_ratios: ['16:9', '1:1'],
        resolutions: ['1024x1024', '1536x1024'],
      },
      '9:16',
      'standard',
    );

    expect(result.effectiveRatio).toBe('16:9');
    expect(result.effectiveResolution).toBe('1024x1024');
    expect(result.resolutionMode).toBe('fixed');
  });

  test('supports tiered image capabilities with per-tier resolutions', () => {
    const result = deriveImageCapabilityState(
      {
        aspect_ratios: ['1:1'],
        resolution_tiers: {
          standard: ['1024x1024'],
          hd: ['1536x1536', '1536x1024'],
        },
      },
      '1:1',
      'bogus',
    );

    expect(result.resolutionMode).toBe('tier');
    expect(result.effectiveResolution).toBe('standard');
    expect(result.effectivePixelResolution).toBe('1024x1024');
    expect(result.effectiveResOptions.map((x) => x.value)).toEqual(['standard', 'hd']);
  });
});
