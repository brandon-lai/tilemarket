import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { normalizeDomain } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Hide or remove a listing. Behind a shared secret.
 *
 * Removal is a status change, never a delete: the payment rows have to
 * survive so the money is still accounted for, and the terms say placement
 * can be pulled for abuse without a refund.
 */
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!hasDatabase) {
    return NextResponse.json({ error: "No database configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    domain?: unknown;
    status?: unknown;
  };
  const normalized = normalizeDomain(String(body.domain ?? ""));
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }
  const status = String(body.status ?? "");
  if (!["live", "hidden", "removed"].includes(status)) {
    return NextResponse.json(
      { error: "status must be live, hidden or removed." },
      { status: 400 },
    );
  }

  const sql = getSql();
  const rows = await sql<{ domain: string; status: string }[]>`
    update listings set status = ${status}, updated_at = now()
    where domain = ${normalized.domain}
    returning domain, status
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "No such listing." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, listing: rows[0] });
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!hasDatabase) {
    return NextResponse.json({ error: "No database configured." }, { status: 503 });
  }
  const sql = getSql();
  const reports = await sql`
    select r.id, r.reason, r.created_at, l.domain, l.status, l.total_cents
    from reports r join listings l on l.id = r.listing_id
    order by r.created_at desc
    limit 100
  `;
  return NextResponse.json({ reports });
}
