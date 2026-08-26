export const MIN_CENTS = 100;
export const MAX_CENTS = 500_000;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usdPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Whole dollars when the cents are zero, two decimals when they are not. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? usd.format(dollars) : usdPrecise.format(dollars);
}

/** For tiles, where horizontal room runs out fast. */
export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 10_000) return formatCents(cents);
  return `$${compact.format(dollars)}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  const digits = Math.abs(pct) >= 100 ? 0 : 1;
  return `${sign}${pct.toFixed(digits)}%`;
}

/**
 * Parse a dollar amount typed by a person into integer cents.
 * Rejects anything outside the payment range rather than clamping, so the
 * error message can say what the limit is.
 */
export function parseDollarsToCents(
  input: string | number,
): { ok: true; cents: number } | { ok: false; reason: string } {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/[$,\s]/g, "");
  if (!raw) return { ok: false, reason: "Enter an amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    return { ok: false, reason: "Enter an amount in dollars, like 25 or 25.50." };

  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) return { ok: false, reason: "That amount is too large." };
  if (cents < MIN_CENTS) return { ok: false, reason: "The minimum is $1." };
  if (cents > MAX_CENTS)
    return {
      ok: false,
      reason: "The maximum single payment is $5,000. Pay again to add more.",
    };
  return { ok: true, cents };
}

/** Validate cents that arrived over the wire rather than from a text field. */
export function validateCents(
  value: unknown,
): { ok: true; cents: number } | { ok: false; reason: string } {
  if (typeof value !== "number" || !Number.isInteger(value))
    return { ok: false, reason: "Amount must be a whole number of cents." };
  if (value < MIN_CENTS) return { ok: false, reason: "The minimum is $1." };
  if (value > MAX_CENTS)
    return { ok: false, reason: "The maximum single payment is $5,000." };
  return { ok: true, cents: value };
}
