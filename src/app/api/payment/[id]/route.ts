import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the success banner. The redirect back from Stripe is not proof of
 * payment, so the page shows a pending state until the webhook has landed and
 * this says otherwise.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!hasDatabase) return NextResponse.json({ status: "unknown" });
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ status: "unknown" }, { status: 400 });
  }

  const sql = getSql();
  const rows = await sql<{ status: string; domain: string; amount_cents: number }[]>`
    select status, domain, amount_cents from payments where id = ${id} limit 1
  `;
  if (rows.length === 0) return NextResponse.json({ status: "unknown" }, { status: 404 });

  return NextResponse.json(
    {
      status: rows[0].status,
      domain: rows[0].domain,
      amountCents: Number(rows[0].amount_cents),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
