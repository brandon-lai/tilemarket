// Exercises the acceptance criterion that matters most: replaying the same
// Stripe webhook event twice must credit the listing exactly once.
//
// Runs against a live dev server and the local database. The signature is
// computed here with the same HMAC scheme Stripe uses, so no Stripe account
// or network call is involved.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });

function sign(payload) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function post(payload) {
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
    body: payload,
  });
  return res.status;
}

function event(id, sessionId, paymentId, domain, amount) {
  return JSON.stringify({
    id,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: amount,
        currency: "usd",
        metadata: { paymentId, domain },
      },
    },
  });
}

const domain = `replaytest-${Date.now()}.com`;
const total = () =>
  sql`select total_cents from listings where domain = ${domain}`.then(
    (r) => Number(r[0]?.total_cents ?? 0),
  );

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}\n     ${err.message}`);
  }
};

// --- a first payment creates the listing -----------------------------------
const p1 = randomUUID();
const s1 = `cs_test_${randomUUID()}`;
await sql`insert into payments (domain, amount_cents, status, stripe_session_id, id)
          values (${domain}, 2500, 'pending', ${s1}, ${p1})`;
const e1 = event(`evt_${randomUUID()}`, s1, p1, domain, 2500);

await check("a completed session credits the listing", async () => {
  assert.equal(await post(e1), 200);
  assert.equal(await total(), 2500);
});

await check("replaying the identical event credits nothing further", async () => {
  assert.equal(await post(e1), 200);
  assert.equal(await total(), 2500);
});

await check("replaying it a third time still credits nothing", async () => {
  assert.equal(await post(e1), 200);
  assert.equal(await total(), 2500);
});

await check("a new event id for the same session does not re-credit", async () => {
  const dup = event(`evt_${randomUUID()}`, s1, p1, domain, 2500);
  assert.equal(await post(dup), 200);
  assert.equal(await total(), 2500);
});

// --- a second payment on the same domain tops it up ------------------------
const p2 = randomUUID();
const s2 = `cs_test_${randomUUID()}`;
await sql`insert into payments (domain, amount_cents, status, stripe_session_id, id)
          values (${domain}, 1000, 'pending', ${s2}, ${p2})`;

await check("paying again on the same domain sums into one listing", async () => {
  assert.equal(await post(event(`evt_${randomUUID()}`, s2, p2, domain, 1000)), 200);
  assert.equal(await total(), 3500);
  const rows = await sql`select count(*)::int as n from listings where domain = ${domain}`;
  assert.equal(rows[0].n, 1, "a second payment created a duplicate listing");
});

// --- forgery and tampering --------------------------------------------------
await check("an unsigned request is refused", async () => {
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: e1,
  });
  assert.equal(res.status, 400);
});

await check("a bad signature is refused", async () => {
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: e1,
  });
  assert.equal(res.status, 400);
});

await check("a tampered body does not verify", async () => {
  const payload = event(`evt_${randomUUID()}`, `cs_test_x`, randomUUID(), domain, 100);
  const header = sign(payload);
  const tampered = payload.replace('"amount_total":100', '"amount_total":500000');
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: tampered,
  });
  assert.equal(res.status, 400);
  assert.equal(await total(), 3500);
});

// --- the amount credited comes from Stripe, not from our own row ------------
await check("the credited amount is the one Stripe reports", async () => {
  const p3 = randomUUID();
  const s3 = `cs_test_${randomUUID()}`;
  // Our pending row claims $50; Stripe says $5 was actually paid.
  await sql`insert into payments (domain, amount_cents, status, stripe_session_id, id)
            values (${domain}, 5000, 'pending', ${s3}, ${p3})`;
  assert.equal(await post(event(`evt_${randomUUID()}`, s3, p3, domain, 500)), 200);
  assert.equal(await total(), 4000, "credited our number instead of Stripe's");
});

await check("no money value is stored as a float", async () => {
  const cols = await sql`
    select data_type from information_schema.columns
    where table_schema = 'public'
      and (column_name like '%cents%' or column_name = 'click_count')
  `;
  for (const c of cols) assert.equal(c.data_type, "bigint", `got ${c.data_type}`);
});

await check("no raw IP addresses are stored anywhere", async () => {
  // Match "ip" as a word, not as a substring: "stripe_session_id" contains
  // "ip" and is not an address.
  const cols = await sql`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public'
      and (column_name ~ '(^|_)ip($|_)' or column_name ilike '%address%')
  `;
  assert.ok(cols.length > 0, "expected to find the click ip column");
  for (const c of cols) {
    assert.equal(
      c.column_name,
      "ip_hash",
      `${c.table_name}.${c.column_name} looks like it holds a raw IP`,
    );
  }
});

await sql`delete from payments where domain = ${domain}`;
await sql`delete from listings where domain = ${domain}`;
await sql.end();
console.log(failures === 0 ? "\nall webhook checks passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
