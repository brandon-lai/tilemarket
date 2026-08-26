import { NextResponse, type NextRequest } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { domainResolves } from "@/lib/dns";
import { normalizeDomain } from "@/lib/domain";
import { validateCents } from "@/lib/money";
import { getStripe, hasStripe, siteUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  if (!hasDatabase || !hasStripe) {
    return fail(
      "Payments are not configured on this deployment, so nothing can be claimed yet.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("That request could not be read. Reload the page and try again.", 400);
  }

  const { domain: rawDomain, amountCents } = (body ?? {}) as {
    domain?: unknown;
    amountCents?: unknown;
  };

  const normalized = normalizeDomain(String(rawDomain ?? ""));
  if (!normalized.ok) return fail(normalized.reason, 400);
  const domain = normalized.domain;

  const amount = validateCents(amountCents);
  if (!amount.ok) return fail(amount.reason, 400);

  // Take money only for somewhere a click can actually land.
  if (!(await domainResolves(domain))) {
    return fail(
      `${domain} does not resolve. Check the spelling, or try again once it is live.`,
      400,
    );
  }

  const sql = getSql();

  try {
    const existing = await sql<{ id: string; status: string }[]>`
      select id, status from listings where domain = ${domain} limit 1
    `;
    if (existing[0]?.status === "removed" || existing[0]?.status === "hidden") {
      return fail("That domain has been removed from the board and cannot be listed.", 403);
    }

    // The payment row exists before the Checkout Session so the session can
    // carry its id, and so a session that is never completed leaves a
    // 'pending' trace rather than nothing at all.
    const [payment] = await sql<{ id: string }[]>`
      insert into payments (listing_id, domain, amount_cents, status, stripe_session_id)
      values (${existing[0]?.id ?? null}, ${domain}, ${amount.cents}, 'pending',
              ${`pending_${crypto.randomUUID()}`})
      returning id
    `;

    const base = siteUrl();
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount.cents,
              product_data: {
                name: `Tile: ${domain}`,
                description: "Board placement. Paid rank, not an endorsement.",
              },
            },
          },
        ],
        metadata: { paymentId: payment.id, domain },
        success_url: `${base}/?claimed=${encodeURIComponent(domain)}&payment=${payment.id}`,
        cancel_url: `${base}/?cancelled=${encodeURIComponent(domain)}`,
      },
      // Derived from the payment id, so a double-submitted form cannot open
      // two sessions for the same intent.
      { idempotencyKey: `checkout_${payment.id}` },
    );

    if (!session.url) {
      await sql`update payments set status = 'failed' where id = ${payment.id}`;
      return fail("Stripe did not return a checkout URL. Try again.", 502);
    }

    await sql`
      update payments set stripe_session_id = ${session.id} where id = ${payment.id}
    `;

    return NextResponse.json({ url: session.url, paymentId: payment.id, domain });
  } catch (err) {
    console.error("checkout failed", err);
    return fail("Checkout could not be started. Try again in a moment.", 500);
  }
}
