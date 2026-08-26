import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CENTS,
  MIN_CENTS,
  formatCents,
  parseDollarsToCents,
  validateCents,
} from "../src/lib/money";

function cents(input: string): number {
  const r = parseDollarsToCents(input);
  assert.equal(r.ok, true, `expected ${input} to parse: ${JSON.stringify(r)}`);
  return (r as { ok: true; cents: number }).cents;
}

test("dollar input becomes integer cents with no float rounding", () => {
  assert.equal(cents("1"), 100);
  assert.equal(cents("25"), 2500);
  assert.equal(cents("25.50"), 2550);
});

test("amounts below the minimum are refused, not clamped", () => {
  const r = parseDollarsToCents("0.99");
  assert.equal(r.ok, false);
});

test("$ signs, commas and whitespace are tolerated", () => {
  assert.equal(cents(" $1,250.25 "), 125025);
});

test("the classic float traps stay exact", () => {
  // 1.1 * 100 is 110.00000000000001 in IEEE 754. Parsing by splitting the
  // string rather than multiplying a float is what keeps these exact.
  assert.equal(cents("1.10"), 110);
  assert.equal(cents("2.30"), 230);
  assert.equal(cents("8.20"), 820);
  assert.equal(cents("1.10") + cents("2.30"), 340);
  assert.equal(cents("4999.99"), 499999);
  for (const input of ["1.10", "2.30", "8.20", "4999.99", "1234.56"]) {
    assert.ok(Number.isSafeInteger(cents(input)), input);
  }
});

test("the payment range is enforced at both ends", () => {
  assert.equal(cents("1"), MIN_CENTS);
  assert.equal(cents("5000"), MAX_CENTS);
  assert.equal(parseDollarsToCents("5000.01").ok, false);
  assert.equal(parseDollarsToCents("0").ok, false);
});

test("malformed input is refused rather than coerced", () => {
  for (const bad of ["", "abc", "1.234", "-5", "1e3", "NaN", "Infinity", "1.2.3"]) {
    assert.equal(parseDollarsToCents(bad).ok, false, bad);
  }
});

test("wire-format cents must be whole integers in range", () => {
  assert.equal(validateCents(2500).ok, true);
  for (const bad of [99, 500001, 25.5, "2500", null, undefined, NaN]) {
    assert.equal(validateCents(bad).ok, false, String(bad));
  }
});

test("display goes through Intl, not string concatenation", () => {
  assert.equal(formatCents(100), "$1");
  assert.equal(formatCents(2550), "$25.50");
  assert.equal(formatCents(125000), "$1,250");
});
