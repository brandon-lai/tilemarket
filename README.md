# tilemarket

**Live:** https://tilemarket.vercel.app

A public board where anyone pays to list a domain. Every listing is a tile.
Tile area is the amount paid. The board looks like a stock market heatmap.

**Pay more, get more of the board.**

No accounts, no login, no email. Paying again on the same domain adds to its
total. Rank is bought, not earned, and the copy says so.

---

## Running it locally

```bash
npm install
cp .env.example .env          # then fill in the values below
createdb tilemarket
npm run db:migrate            # applies db/schema.sql
npm run db:seed               # 60 fake listings on a power-law distribution
npm run dev
```

The seed matters. The layout problems in this product only appear at 40+
listings, so build against the seeded board rather than a handful of rows.

### Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | for real data | Postgres. Without it the app serves a deterministic demo board and refuses every write. |
| `STRIPE_SECRET_KEY` | for payments | Test-mode key in development. Live keys never go in the repo. |
| `STRIPE_WEBHOOK_SECRET` | for payments | From `stripe listen`, or from the dashboard endpoint in production. |
| `NEXT_PUBLIC_SITE_URL` | yes | Origin used to build Checkout success/cancel URLs. |
| `TREEMAP_EXPONENT` | no | Tile weight is `total_cents ^ this`. Defaults to `0.65`. See below. |
| `IP_HASH_SECRET` | yes | Salt base for click hashing. Any long random string. |
| `ADMIN_SECRET` | yes | Shared secret for the hide/remove route. |
| `BLOB_READ_WRITE_TOKEN` | no | When set, favicons go to Vercel Blob instead of a `bytea` column. |

### Stripe locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret it prints as `STRIPE_WEBHOOK_SECRET`. Test with a
declined card (`4000 0000 0000 0002`) and a 3DS card
(`4000 0025 0000 3155`), not just the happy path.

---

## How it works

### The treemap

Squarified, not slice-and-dice — at 20+ tiles slice-and-dice produces ratios
like 400x8 and nothing is readable. Implemented directly in
`src/lib/treemap.ts`.

Tile weight is `total_cents ^ TREEMAP_EXPONENT`, not the raw total. Raw values
let the top listing swallow the board and render everything below rank 10
unreadable. **The exponent is the single most important tuning constant in this
project**, which is why it is an env var rather than a literal. A minimum
weight floor of 0.9% of total weight then stops any tile collapsing to a
sliver.

Named tiles shown is `clamp(round(w * h / 12000), 6, 24)`. That is measured,
not guessed: a tile needs roughly 52x22px to show a domain at 11px. Everything
past that count goes to the list below the map, never into a grouped tile.

### The re-layout animation is the product

Tiles are absolutely positioned elements keyed by domain, with a 450ms CSS
transition on `left`/`top`/`width`/`height`. React reconciles by key, so the
existing DOM nodes are moved rather than rebuilt. Rebuilding the markup kills
both the animation and the listeners. When a payment lands, every tile shoves
sideways — that is the shareable moment, and it is where the design budget went.

### Spotlight

One tile at 8% of board area, outlined in the accent colour, cycling every 5
seconds through listings that did not make the named set. One extra slot per 40
listings in the tail, capped at 4 — without that rule a long tail means a
listing's turn comes around once an hour and the bottom tier is worthless.

Rotation is seeded from the hour and the wall clock, never from `Math.random`,
so everyone looking in the same minute sees roughly the same board.

### Favicons

Fetched server-side once per domain, normalised to a 64px PNG, composited onto
a light neutral square (a large share of favicons are white-on-transparent and
otherwise vanish), then cached and served from our own origin. Never hotlinked.

The chain talks only to the target site, so there is no third-party favicon
service to go stale: `apple-touch-icon` link → `icon`/`shortcut icon` link →
`/apple-touch-icon.png` → `/favicon.ico` → a generated letter tile. Fetches
time out at 3s and never block checkout or page render; a listing goes live
immediately with the letter fallback and upgrades when the job finishes.
Re-fetched at most once every 30 days.

### Payments

Stripe Checkout, hosted. No card form, no stored cards, no subscriptions.

**The webhook is the only place a listing total ever changes.** The success page
is a redirect target, not proof of payment — it credits nothing and polls
`/api/payment/:id` for a pending state instead.

Two things in `src/app/api/stripe/webhook/route.ts` are load-bearing:

1. The signature is verified against `await req.text()`, the raw bytes.
   Verifying against a re-serialised parsed body fails, and getting this wrong
   is the most common way this integration breaks.
2. `stripe_event_id` has a unique constraint and is claimed inside the same
   transaction as the credit. Stripe retries; without this a listing is
   credited twice.

### Clicks

Tiles and rows link to `/go/:listingId`, which records the click and 302s to
the domain. Counted once per visitor per listing per day so the public number
means something. IPs are hashed with a daily rotating salt and never stored
raw — because the salt rotates, a single unique index on
`(listing_id, ip_hash)` *is* the per-day cap, and the database enforces it
rather than application code racing itself.

### Money

Integer cents everywhere, `bigint` in Postgres, never a float. Display goes
through `Intl.NumberFormat`. USD only.

---

## Decisions taken

The PRD left four questions open. These are the answers this build ships with:

- **Listings do not expire, and totals do not decay.** Permanence is simpler,
  it matches the prototype, and a decay rule is a subscription in disguise that
  makes people angry. The cost is real: the board eventually cannot be topped
  and goes static. That is a growth problem to solve with product, not with a
  silent tax on people who already paid.
- **No free tier.** Free listings would fill the board fast at launch and make
  it look alive, at the price of making the $1 tier worthless. $1 is already
  low enough to be a free tier that clears bots.
- **Stripe Tax off, USD only.** Correct for a US-only v1 and a decision to
  revisit deliberately before taking meaningful international volume.
- **Day 30, when nobody is bidding**, is the actual risk in this category and
  nothing in the code solves it. The spotlight rotation and the full tail list
  are the two hedges that are in scope here.

## Deployment status

The Vercel project builds from this repo on every push to `main`.

The deployment currently runs in **no-database mode**: it renders a
deterministic generated board so the layout, the animation, the spotlight
rotation and the full list are all real and inspectable, while every write path
refuses rather than pretending to have worked. Two credentials turn it into a
live product, and neither can be created on the owner's behalf:

1. **Postgres.** Any connection string works. Set `DATABASE_URL` in the Vercel
   project, then run `npm run db:migrate` against it.
2. **Stripe.** Set `STRIPE_SECRET_KEY` and, after creating a webhook endpoint
   pointing at `/api/stripe/webhook`, `STRIPE_WEBHOOK_SECRET`.

Nothing else changes. `hasDatabase` and `hasStripe` are read at every entry
point, so the app switches over on the next deploy.

## Admin

```bash
curl -X POST https://<host>/api/admin/listing \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -H 'content-type: application/json' \
  -d '{"domain":"example.com","status":"removed"}'
```

`GET` the same route with the header to read recent abuse reports. Removal is a
status change, never a delete: payment rows have to survive so the money stays
accounted for.

## Tests

```bash
npm test
```

Covers domain normalisation, money parsing, the treemap invariants, and
spotlight rotation.
