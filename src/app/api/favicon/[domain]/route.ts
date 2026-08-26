import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

/** Serves the cached PNG from our own origin. Never a hotlink. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ domain: string }> },
) {
  const { domain } = await ctx.params;
  if (!hasDatabase) return new NextResponse(null, { status: 404 });

  const sql = getSql();
  const rows = await sql<{ favicon_bytes: Buffer | null }[]>`
    select favicon_bytes from listings where domain = ${domain.toLowerCase()} limit 1
  `;
  const bytes = rows[0]?.favicon_bytes;
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
