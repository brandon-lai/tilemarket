export const SPOTLIGHT_INTERVAL_MS = 5000;
export const SPOTLIGHT_AREA_SHARE = 0.08;

/**
 * One extra spotlight slot per 40 listings in the tail, capped at 4.
 *
 * Without this a long tail means a listing's turn comes around once an hour,
 * and the bottom tier is worth nothing.
 */
export function spotlightSlotCount(tailLength: number): number {
  if (tailLength <= 0) return 0;
  return Math.min(4, 1 + Math.floor(tailLength / 40));
}

/**
 * Which tail listings are in the spotlight right now.
 *
 * Seeded from the hour and the tick index rather than Math.random, so every
 * visitor in the same minute sees roughly the same board. A per-client random
 * would mean two people looking at the same page never see the same thing,
 * which quietly kills the "look at this" moment.
 */
export function spotlightIndices(
  tailLength: number,
  tick: number,
  hourSeed: number,
): number[] {
  const slots = spotlightSlotCount(tailLength);
  if (slots === 0) return [];
  const offset = hourSeed % Math.max(tailLength, 1);
  const picks: number[] = [];
  for (let s = 0; s < slots && s < tailLength; s++) {
    const index = (offset + tick * slots + s) % tailLength;
    if (!picks.includes(index)) picks.push(index);
  }
  return picks;
}

export function hourSeed(now = Date.now()): number {
  return Math.floor(now / 3_600_000);
}

export function spotlightTick(now = Date.now()): number {
  return Math.floor(now / SPOTLIGHT_INTERVAL_MS);
}
