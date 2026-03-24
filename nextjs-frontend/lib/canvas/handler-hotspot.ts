export type HandlerHotspotHit = {
  handleId: 'in' | 'out';
  direction: 'input' | 'output';
};

const HANDLE_RADIUS = 20;

export function detectHandlerHotspot(
  nodeElement: HTMLElement,
  clientX: number,
  clientY: number,
  options: { hasInput?: boolean; hasOutput?: boolean } = {},
): HandlerHotspotHit | null {
  const rect = nodeElement.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;

  const candidates: Array<{ x: number; hit: HandlerHotspotHit; enabled: boolean }> = [
    {
      x: rect.left,
      hit: { handleId: 'in', direction: 'input' },
      enabled: options.hasInput !== false,
    },
    {
      x: rect.right,
      hit: { handleId: 'out', direction: 'output' },
      enabled: options.hasOutput !== false,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.enabled) continue;
    const dx = clientX - candidate.x;
    const dy = clientY - centerY;
    if ((dx * dx) + (dy * dy) <= HANDLE_RADIUS * HANDLE_RADIUS) {
      return candidate.hit;
    }
  }

  return null;
}
