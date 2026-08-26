import type { BoardData, Listing } from "./board";

/** mulberry32. Deterministic, so the demo board is identical everywhere. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "north", "atlas", "ember", "quill", "harbor", "signal", "meridian", "kiln",
  "orchard", "basalt", "lantern", "cobalt", "prairie", "verge", "tidal",
  "junction", "marrow", "pivot", "slate", "thicket", "umber", "vellum",
  "windrow", "yarrow", "zenith", "alder", "bramble", "cinder", "drift",
  "fathom", "gable", "hollow", "inlet", "jetty", "keel", "loam", "mast",
  "nimbus", "onyx", "plinth", "quarry", "ridge", "sable", "trellis", "vault",
];
const TLDS = ["com", "com", "com", "io", "co", "dev", "app", "net", "xyz", "ai"];

export type SeedListing = { domain: string; totalCents: number; clicks: number };

/**
 * 60 listings on a power-law distribution.
 *
 * The layout problems in this product only appear at 40+ listings, so every
 * design decision on the board was made against this shape rather than
 * against a handful of hand-typed rows.
 */
export function seedListings(count = 60, seed = 20260826): SeedListing[] {
  const rand = rng(seed);
  const used = new Set<string>();
  const out: SeedListing[] = [];

  for (let i = 0; i < count; i++) {
    let domain = "";
    do {
      const a = WORDS[Math.floor(rand() * WORDS.length)];
      const b = WORDS[Math.floor(rand() * WORDS.length)];
      const tld = TLDS[Math.floor(rand() * TLDS.length)];
      domain = a === b ? `${a}.${tld}` : `${a}${b}.${tld}`;
    } while (used.has(domain));
    used.add(domain);

    // Pareto-ish: rank 1 lands near $2,500, the tail bottoms out at $1.
    const rank = i + 1;
    const base = 250_000 / Math.pow(rank, 1.65);
    const jitter = 0.6 + rand() * 0.9;
    const cents = Math.max(100, Math.round((base * jitter) / 100) * 100);
    out.push({
      domain,
      totalCents: cents,
      clicks: Math.round(rand() * Math.sqrt(cents) * 0.4),
    });
  }

  return out.sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * The board with no database behind it. A fresh deploy renders a real,
 * correctly-laid-out board immediately; wiring DATABASE_URL swaps in live
 * data with no other change. Write paths refuse in this mode rather than
 * pretending to have worked.
 */
export function demoBoard(exponent: number): BoardData {
  const rand = rng(777);
  const seeded = seedListings();
  const totalCents = seeded.reduce((s, l) => s + l.totalCents, 0);

  const listings: Listing[] = seeded.map((l, i) => {
    const gained = i % 3 === 0 ? Math.round(l.totalCents * rand() * 0.2) : 0;
    const prior = l.totalCents - gained;
    return {
      id: `demo-${i}`,
      domain: l.domain,
      totalCents: l.totalCents,
      clickCount: l.clicks,
      faviconUrl: null,
      faviconState: "failed",
      change24h: prior > 0 ? gained / prior : null,
      shareDelta: gained > 0 ? 0.001 : -0.0002,
      gained24hCents: gained,
      createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
    };
  });

  return {
    listings,
    totalCents,
    listingCount: listings.length,
    topDomain: listings[0]?.domain ?? null,
    visitorsOnline: 1,
    treemapExponent: exponent,
    demo: true,
    generatedAt: new Date().toISOString(),
  };
}
