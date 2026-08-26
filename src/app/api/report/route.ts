import { NextResponse, type NextRequest } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { hashedClientIp } from "@/lib/iphash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Reporting is not available here." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: unknown;
    reason?: unknown;
  };
  const listingId = String(body.listingId ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 500);

  if (!/^[0-9a-f-]{36}$/i.test(listingId)) {
    return NextResponse.json({ error: "Unknown listing." }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Say briefly what is wrong with this listing." },
      { status: 400 },
    );
  }

  const sql = getSql();
  try {
    await sql`
      insert into reports (listing_id, reason, ip_hash)
      values (${listingId}, ${reason}, ${hashedClientIp(req)})
    `;
  } catch {
    return NextResponse.json({ error: "Unknown listing." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
