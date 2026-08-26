import { NextResponse, type NextRequest } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { hashedClientIp } from "@/lib/iphash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Click redirect. Records the click, then 302s to the listing.
 *
 * Counted once per visitor per listing per day so the public number means
 * something. The unique index does the deduplication, which is also what
 * makes two simultaneous clicks safe.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  if (!hasDatabase) return NextResponse.redirect(new URL("/", req.url));
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const sql = getSql();
  const rows = await sql<{ domain: string; status: string }[]>`
    select domain, status from listings where id = ${id} limit 1
  `;
  const listing = rows[0];
  if (!listing || listing.status !== "live") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  try {
    const inserted = await sql<{ id: string }[]>`
      insert into clicks (listing_id, ip_hash)
      values (${id}, ${hashedClientIp(req)})
      on conflict (listing_id, ip_hash) do nothing
      returning id
    `;
    if (inserted.length > 0) {
      await sql`
        update listings set click_count = click_count + 1, updated_at = now()
        where id = ${id}
      `;
    }
  } catch (err) {
    // A click that fails to record must still reach its destination.
    console.error("click recording failed", err);
  }

  return NextResponse.redirect(`https://${listing.domain}/`, { status: 302 });
}
