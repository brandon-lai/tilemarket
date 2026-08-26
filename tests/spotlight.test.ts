import assert from "node:assert/strict";
import { test } from "node:test";
import { spotlightIndices, spotlightSlotCount } from "../src/lib/spotlight";

test("one extra slot per 40 tail listings, capped at four", () => {
  assert.equal(spotlightSlotCount(0), 0);
  assert.equal(spotlightSlotCount(1), 1);
  assert.equal(spotlightSlotCount(39), 1);
  assert.equal(spotlightSlotCount(40), 2);
  assert.equal(spotlightSlotCount(120), 4);
  assert.equal(spotlightSlotCount(10_000), 4);
});

test("slots in the same tick show different listings", () => {
  const picks = spotlightIndices(200, 7, 12345);
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks).size, 4);
});

test("rotation is a pure function of tick and hour, never random", () => {
  const a = spotlightIndices(75, 12, 999);
  const b = spotlightIndices(75, 12, 999);
  assert.deepEqual(a, b);
  // Two visitors in the same minute see the same board; that is the point.
  assert.notDeepEqual(a, spotlightIndices(75, 13, 999));
});

test("every tail listing gets a turn within one full cycle", () => {
  const tail = 50;
  const slots = spotlightSlotCount(tail); // 2
  const seen = new Set<number>();
  for (let tick = 0; tick < Math.ceil(tail / slots) + 2; tick++) {
    for (const i of spotlightIndices(tail, tick, 0)) seen.add(i);
  }
  assert.equal(seen.size, tail, "some listing never came around");
});

test("indices always land inside the tail", () => {
  for (const len of [1, 2, 5, 41, 199]) {
    for (let tick = 0; tick < 30; tick++) {
      for (const i of spotlightIndices(len, tick, 3)) {
        assert.ok(i >= 0 && i < len);
      }
    }
  }
});
