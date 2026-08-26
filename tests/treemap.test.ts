import assert from "node:assert/strict";
import { test } from "node:test";
import { namedTileCount, squarify, weightsFor } from "../src/lib/treemap";
import { seedListings } from "../src/lib/demo";

const W = 660;
const H = 400;

function board(count = 60) {
  const listings = seedListings(count);
  const weights = weightsFor(listings.map((l) => l.totalCents), 0.65);
  return squarify(
    listings.map((l, i) => ({ key: l.domain, weight: weights[i] })),
    W,
    H,
  );
}

test("every input gets exactly one rectangle", () => {
  const rects = board();
  assert.equal(rects.length, 60);
  assert.equal(new Set(rects.map((r) => r.key)).size, 60);
});

test("rectangles tile the canvas without overflowing it", () => {
  for (const r of board()) {
    assert.ok(r.x >= -1e-6 && r.y >= -1e-6, `${r.key} starts off-canvas`);
    assert.ok(r.x + r.w <= W + 1e-6, `${r.key} overflows the right edge`);
    assert.ok(r.y + r.h <= H + 1e-6, `${r.key} overflows the bottom edge`);
    assert.ok(r.w > 0 && r.h > 0, `${r.key} has no area`);
  }
});

test("rectangles do not overlap", () => {
  const rects = board(40);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const disjoint =
        a.x + a.w <= b.x + 1e-6 ||
        b.x + b.w <= a.x + 1e-6 ||
        a.y + a.h <= b.y + 1e-6 ||
        b.y + b.h <= a.y + 1e-6;
      assert.ok(disjoint, `${a.key} overlaps ${b.key}`);
    }
  }
});

test("the rectangles consume the whole canvas area", () => {
  const covered = board().reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(covered - W * H) / (W * H) < 0.001);
});

test("aspect ratios stay usable, which is why this is not slice-and-dice", () => {
  // Slice-and-dice on this dataset produces ratios in the hundreds.
  const ratios = board(24).map((r) => Math.max(r.w / r.h, r.h / r.w));
  const worst = Math.max(...ratios);
  assert.ok(worst < 12, `worst aspect ratio was ${worst.toFixed(1)}`);
});

test("the exponent is what stops the top listing swallowing the board", () => {
  const totals = seedListings().map((l) => l.totalCents);
  const share = (exp: number) => {
    const w = weightsFor(totals, exp);
    return w[0] / w.reduce((s, v) => s + v, 0);
  };
  // Raw totals (exponent 1) hand the top listing far more of the board than
  // the tuned value does.
  assert.ok(share(1) > share(0.65));
  assert.ok(share(0.65) < 0.35);
});

test("no tile collapses below the 0.9% weight floor", () => {
  const totals = seedListings().map((l) => l.totalCents);
  const weights = weightsFor(totals, 0.65);
  const sum = weights.reduce((s, v) => s + v, 0);
  for (const w of weights) {
    assert.ok(w / sum >= 0.009 - 1e-9);
  }
});

test("tile count follows the canvas and stays inside its clamp", () => {
  assert.equal(namedTileCount(660, 400), 22); // the reference desktop canvas
  assert.ok(namedTileCount(360, 320) >= 6);
  assert.ok(namedTileCount(360, 320) <= 24);
  assert.equal(namedTileCount(4000, 4000), 24);
  assert.equal(namedTileCount(10, 10), 6);
});

test("degenerate inputs do not throw", () => {
  assert.deepEqual(squarify([], 100, 100), []);
  assert.deepEqual(squarify([{ key: "a", weight: 1 }], 0, 100), []);
  assert.deepEqual(squarify([{ key: "a", weight: 0 }], 100, 100), []);
  assert.equal(squarify([{ key: "a", weight: 5 }], 100, 100).length, 1);
});

test("the floor degrades gracefully when more tiles than can fit are passed", () => {
  // 200 tiles at 0.9% each is 180% of a board. There is no floor that
  // satisfies every tile, so every tile gets equal area instead.
  const weights = weightsFor(new Array(200).fill(0).map((_, i) => i + 1), 0.65);
  assert.equal(new Set(weights).size, 1);
});

test("the floor holds against the post-floor total, not the raw one", () => {
  const totals = [1_000_000, 500_000, 100, 100, 100, 100];
  const weights = weightsFor(totals, 0.65);
  const sum = weights.reduce((s, v) => s + v, 0);
  for (const w of weights) assert.ok(w / sum >= 0.009 - 1e-9);
});
