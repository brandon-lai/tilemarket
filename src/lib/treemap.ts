export type TreemapInput = { key: string; weight: number };
export type TreemapRect = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Squarified treemap (Bruls, Huizing, van Wijk 2000).
 *
 * Slice-and-dice is deliberately not used here: at 20+ tiles it produces
 * ratios like 400x8 and nothing is readable.
 *
 * Inputs must already be sorted descending by weight, which is what the
 * algorithm needs to keep ratios near 1.
 */
export function squarify(
  items: TreemapInput[],
  width: number,
  height: number,
): TreemapRect[] {
  const out: TreemapRect[] = [];
  if (width <= 0 || height <= 0) return out;

  const positive = items.filter((i) => i.weight > 0);
  const totalWeight = positive.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return out;

  // Work in area units so a row's aspect ratio is directly comparable.
  const scale = (width * height) / totalWeight;
  const queue = positive.map((i) => ({ key: i.key, area: i.weight * scale }));

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: { key: string; area: number }[] = [];

  const shortSide = () => Math.min(w, h);

  // Worst aspect ratio in `row` if `extra` is appended to it.
  const worst = (r: { area: number }[], extra: number | null, side: number) => {
    let sum = 0;
    let min = Infinity;
    let max = 0;
    for (const item of r) {
      sum += item.area;
      if (item.area < min) min = item.area;
      if (item.area > max) max = item.area;
    }
    if (extra !== null) {
      sum += extra;
      if (extra < min) min = extra;
      if (extra > max) max = extra;
    }
    if (sum <= 0 || min === Infinity) return Infinity;
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const layoutRow = () => {
    const rowArea = row.reduce((s, i) => s + i.area, 0);
    if (rowArea <= 0) {
      row = [];
      return;
    }
    if (w >= h) {
      // Row occupies a full-height column of width `rowWidth` on the left.
      const rowWidth = rowArea / h;
      let cursor = y;
      for (const item of row) {
        const itemH = (item.area / rowArea) * h;
        out.push({ key: item.key, x, y: cursor, w: rowWidth, h: itemH });
        cursor += itemH;
      }
      x += rowWidth;
      w -= rowWidth;
    } else {
      // Row occupies a full-width band of height `rowHeight` at the top.
      const rowHeight = rowArea / w;
      let cursor = x;
      for (const item of row) {
        const itemW = (item.area / rowArea) * w;
        out.push({ key: item.key, x: cursor, y, w: itemW, h: rowHeight });
        cursor += itemW;
      }
      y += rowHeight;
      h -= rowHeight;
    }
    row = [];
  };

  for (const item of queue) {
    const side = shortSide();
    if (side <= 0) break;
    if (row.length === 0 || worst(row, item.area, side) <= worst(row, null, side)) {
      row.push(item);
    } else {
      layoutRow();
      row.push(item);
    }
  }
  layoutRow();

  return out;
}

/**
 * Tile weight is `total_cents ^ exponent`, not the raw total.
 *
 * Raw values make the top listing swallow the board: one $2,000 listing
 * against fifty $1 listings leaves the $1 tiles at a fraction of a pixel.
 * The exponent is the single most important tuning constant on this page,
 * which is why it is an env var rather than a literal.
 *
 * A floor of 0.9% of total weight then guarantees no tile collapses to a
 * sliver, at the cost of the very largest tiles being slightly under-sized.
 */
export function weightsFor(
  totals: number[],
  exponent: number,
  floorShare = 0.009,
): number[] {
  const raw = totals.map((t) => Math.pow(Math.max(t, 0), exponent));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0 || raw.length === 0) return raw.map(() => 1);

  // The floor has to be a share of the *final* total, not the raw one.
  // Raising a sliver raises the total too, which would push it straight back
  // under the floor. Solve for the floor value instead of iterating:
  //
  //   f = floorShare * (sumOfUnflooredWeights + flooredCount * f)
  //
  // rearranged to f = floorShare * rest / (1 - floorShare * flooredCount).
  // Each pass can only add items to the floored set, so this settles in at
  // most `raw.length` passes.
  let floored = new Set<number>();
  let floor = 0;

  for (let pass = 0; pass <= raw.length; pass++) {
    const denom = 1 - floorShare * floored.size;
    // More tiles than the floor can fit on one board. Nothing can satisfy the
    // guarantee, so give every tile the same area rather than an arbitrary
    // partial one.
    if (denom <= 0) return raw.map(() => 1);

    let rest = 0;
    for (let i = 0; i < raw.length; i++) if (!floored.has(i)) rest += raw[i];
    floor = (floorShare * rest) / denom;

    const next = new Set(floored);
    for (let i = 0; i < raw.length; i++) if (raw[i] < floor) next.add(i);
    if (next.size === floored.size) break;
    floored = next;
  }

  return raw.map((v) => Math.max(v, floor));
}

/**
 * How many named tiles fit on a canvas.
 *
 * Measured, not guessed: a tile needs roughly 52x22px to show a domain at
 * 11px. A 660x400 canvas yields about 22, a phone about 12. Everything past
 * that count lives in the list below the map.
 */
export function namedTileCount(width: number, height: number): number {
  const raw = Math.round((width * height) / 12000);
  return Math.min(24, Math.max(6, raw));
}
