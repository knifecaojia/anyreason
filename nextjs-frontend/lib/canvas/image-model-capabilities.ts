export type ImageCapabilityShape = {
  aspect_ratios?: string[];
  resolutions?: string[];
  resolution_tiers?: string[] | Record<string, string[]>;
};

export type ResolutionMode = 'tier' | 'fixed' | 'default';

export function deriveImageCapabilityState(
  caps: ImageCapabilityShape | undefined,
  currentRatio: string,
  currentResolution: string,
): {
  effectiveRatio: string;
  effectiveResolution: string;
  effectivePixelResolution: string | null;
  resolutionMode: ResolutionMode;
  effectiveRatios: string[];
  effectiveResOptions: Array<{ label: string; value: string }>;
} {
  const fallbackRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  const fallbackResOptions = [
    { label: '标准', value: 'standard' },
    { label: 'HD', value: 'hd' },
    { label: '2K', value: '2k' },
    { label: '4K', value: '4k' },
  ];

  const effectiveRatios = caps?.aspect_ratios?.length ? caps.aspect_ratios : fallbackRatios;
  const effectiveRatio = effectiveRatios.includes(currentRatio) ? currentRatio : effectiveRatios[0];

  const hasTierObject = !!caps?.resolution_tiers && !Array.isArray(caps.resolution_tiers) && Object.keys(caps.resolution_tiers).length > 0;
  const hasTierArray = Array.isArray(caps?.resolution_tiers) && caps!.resolution_tiers.length > 0;
  const hasFixed = !!caps?.resolutions?.length;

  const resolutionMode: ResolutionMode = hasTierObject || hasTierArray ? 'tier' : hasFixed ? 'fixed' : 'default';

  const effectiveResOptions = resolutionMode === 'tier'
    ? (Array.isArray(caps?.resolution_tiers)
        ? caps!.resolution_tiers.map((t) => ({ label: t, value: t }))
        : Object.keys((caps?.resolution_tiers as Record<string, string[]>) || {}).map((t) => ({ label: t, value: t })))
    : resolutionMode === 'fixed'
      ? (caps!.resolutions || []).map((r) => ({ label: r.replace('*', 'x'), value: r }))
      : fallbackResOptions;

  const effectiveResolution = effectiveResOptions.some((x) => x.value === currentResolution)
    ? currentResolution
    : (effectiveResOptions[0]?.value || 'standard');

  let effectivePixelResolution: string | null = null;
  if (resolutionMode === 'fixed') {
    effectivePixelResolution = effectiveResolution;
  } else if (resolutionMode === 'tier' && hasTierObject) {
    const tierRes = (caps!.resolution_tiers as Record<string, string[]>)[effectiveResolution] || [];
    effectivePixelResolution = tierRes[0] || null;
  }

  return {
    effectiveRatio,
    effectiveResolution,
    effectivePixelResolution,
    resolutionMode,
    effectiveRatios,
    effectiveResOptions,
  };
}
