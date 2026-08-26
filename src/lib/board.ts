import { getSql, hasDatabase } from "./db";
import { demoBoard } from "./demo";

export type Listing = {
  id: string;
  domain: string;
  totalCents: number;
  clickCount: number;
  faviconUrl: string | null;
  faviconState: "pending" | "ok" | "failed";
  /** Fractional growth of this listing's own total over 24h. Null when new. */
  change24h: number | null;
  /** Change in this listing's share of the whole board over 24h. */
  shareDelta: number;
  gained24hCents: number;
  createdAt: string;
};

export type BoardData = {
  listings: Listing[];
  totalCents: number;
  listingCount: number;
  topDomain: string | null;
  visitorsOnline: number;
  treemapExponent: number;
  demo: boolean;
  generatedAt: string;
};

export function treemapExponent(): number {
  const raw = Number(process.env.TREEMAP_EXPONENT);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.65;
}

type Row = {
  id: string;
  domain: string;
  total_cents: number;
  click_count: number;
  favicon_url: string | null;
  favicon_state: "pending" | "ok" | "failed";
  gained_24h: number;
  created_at: Date;
};

/**
 * Everything the page needs in one query. Momentum is computed here rather
 * than in a second round trip because the board re-reads this every 10
 * seconds and a second query would double that load for no benefit.
 */
export async function loadBoard(): Promise<BoardData> {
  if (!hasDatabase) return demoBoard(treemapExponent());

  const sql = getSql();
  const [rows, visitors] = await Promise.all([
    sql<Row[]>`
      select
        l.id,
        l.domain,
        l.total_cents,
        l.click_count,
        l.favicon_url,
        l.favicon_state,
        l.created_at,
        coalesce((
          select sum(p.amount_cents)
          from payments p
          where p.listing_id = l.id
            and p.status = 'paid'
            and p.paid_at > now() - interval '24 hours'
        ), 0) as gained_24h
      from listings l
      where l.status = 'live'
      order by l.total_cents desc, l.created_at asc
    `,
    // "Visitors online" is distinct click sources in the last five minutes.
    // It is a real number derived from real activity, not a fabricated one.
    sql<{ n: number }[]>`
      select count(distinct ip_hash)::bigint as n
      from clicks
      where created_at > now() - interval '5 minutes'
    `,
  ]);

  const totalCents = rows.reduce((s, r) => s + Number(r.total_cents), 0);
  const priorTotal = rows.reduce(
    (s, r) => s + Number(r.total_cents) - Number(r.gained_24h),
    0,
  );

  const listings: Listing[] = rows.map((r) => {
    const total = Number(r.total_cents);
    const gained = Number(r.gained_24h);
    const prior = total - gained;
    const shareNow = totalCents > 0 ? total / totalCents : 0;
    const sharePrior = priorTotal > 0 ? prior / priorTotal : 0;
    return {
      id: r.id,
      domain: r.domain,
      totalCents: total,
      clickCount: Number(r.click_count),
      faviconUrl: r.favicon_url,
      faviconState: r.favicon_state,
      change24h: prior > 0 ? gained / prior : null,
      shareDelta: shareNow - sharePrior,
      gained24hCents: gained,
      createdAt: r.created_at.toISOString(),
    };
  });

  return {
    listings,
    totalCents,
    listingCount: listings.length,
    topDomain: listings[0]?.domain ?? null,
    // Floor at 1: whoever is loading this page is online.
    visitorsOnline: Math.max(1, Number(visitors[0]?.n ?? 0)),
    treemapExponent: treemapExponent(),
    demo: false,
    generatedAt: new Date().toISOString(),
  };
}
