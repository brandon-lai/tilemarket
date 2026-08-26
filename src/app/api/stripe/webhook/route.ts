import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getSql, hasDatabase } from "@/lib/db";
import { normalizeDomain } from "@/lib/domain";
import { refreshFavicon } from "@/lib/favicon";
import { getStripe, hasStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only place a listing total ever changes.
 *
 * The success page is a redirect target, not proof of payment, and credits
 * nothing.
 */
export async function POST(req: NextRequest) {
  if (!hasDatabase || !hasStripe) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // The signature is computed over the exact bytes Stripe sent. Reading the
  // parsed JSON body and re-serialising it produces a different string and
  // the verification fails; this is the single most common way this
  // integration breaks.
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await creditSession(event, event.data.object);
        break;
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        await failSession(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`webhook handling failed for ${event.id}`, err);
    // A 500 asks Stripe to retry, which the event-id guard makes safe.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function creditSession(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const sql = getSql();
  const paymentId = session.metadata?.paymentId ?? null;
  const metaDomain = session.metadata?.domain ?? "";
  const normalized = normalizeDomain(metaDomain);
  if (!normalized.ok) {
    console.error(`webhook ${event.id} carried an unusable domain: ${metaDomain}`);
    return;
  }
  const domain = normalized.domain;

  // Trust the amount Stripe reports, not anything the client sent.
  const amountCents = session.amount_total;
  if (typeof amountCents !== "number" || amountCents <= 0) {
    console.error(`webhook ${event.id} had no amount_total`);
    return;
  }

  const credited = await sql.begin(async (tx) => {
    // Stripe retries. Claiming the event id first, inside the transaction,
    // means a replay of the same event credits the listing exactly once —
    // the unique constraint on stripe_event_id makes the second attempt a
    // no-op update that matches zero rows.
    const claimed = await tx<{ id: string }[]>`
      update payments set
        status = 'paid',
        paid_at = coalesce(paid_at, now()),
        stripe_event_id = ${event.id},
        amount_cents = ${amountCents}
      where ${
        paymentId
          ? tx`id = ${paymentId}::uuid`
          : tx`stripe_session_id = ${session.id}`
      }
        and stripe_event_id is null
        and status <> 'paid'
      returning id
    `;
    if (claimed.length === 0) return false;

    const [listing] = await tx<{ id: string }[]>`
      insert into listings (domain, total_cents, status)
      values (${domain}, ${amountCents}, 'live')
      on conflict (domain) do update set
        total_cents = listings.total_cents + ${amountCents},
        updated_at = now()
      returning id
    `;

    await tx`update payments set listing_id = ${listing.id} where id = ${claimed[0].id}`;
    return true;
  });

  if (!credited) {
    console.log(`webhook ${event.id} was a replay; listing not credited twice`);
    return;
  }

  // Return 200 quickly. The favicon fetch is fire-and-forget: a listing is
  // live with the letter fallback the moment it is credited, and upgrades
  // when this settles.
  void refreshFavicon(domain).catch((err) =>
    console.error(`background favicon fetch failed for ${domain}`, err),
  );
}

async function failSession(session: Stripe.Checkout.Session) {
  const sql = getSql();
  await sql`
    update payments set status = 'failed'
    where stripe_session_id = ${session.id} and status = 'pending'
  `;
}
