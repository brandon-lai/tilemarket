/**
 * FNV-1a. Deterministic and dependency-free, so the letter fallback renders
 * the same colour on the server, on the client and inside the cached PNG.
 */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function letterTileColor(domain: string): string {
  const hue = hashString(domain) % 360;
  return `hsl(${hue} 32% 58%)`;
}

/**
 * Five-step grey ramp across the board, on a log scale.
 *
 * Linear shading puts every listing below the top two or three in the
 * lightest bucket, which wastes the ramp entirely.
 */
export function rampStep(total: number, min: number, max: number): 1 | 2 | 3 | 4 | 5 {
  if (!(max > min) || total <= 0) return 3;
  const lo = Math.log(Math.max(min, 1));
  const hi = Math.log(Math.max(max, 2));
  const t = (Math.log(Math.max(total, 1)) - lo) / (hi - lo);
  const step = Math.floor(t * 5) + 1;
  return Math.min(5, Math.max(1, step)) as 1 | 2 | 3 | 4 | 5;
}
