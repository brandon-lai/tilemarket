import "dotenv/config";
import postgres from "postgres";
import { seedListings } from "../src/lib/demo";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
  max: 1,
});

const listings = seedListings();

async function main() {
  try {
    await sql.begin(async (tx) => {
    for (const [i, l] of listings.entries()) {
      const [row] = await tx<{ id: string }[]>`
        insert into listings (domain, total_cents, click_count, favicon_state, created_at)
        values (${l.domain}, ${l.totalCents}, ${l.clicks}, 'pending',
                now() - (${i} * interval '1 hour'))
        on conflict (domain) do update set
          total_cents = excluded.total_cents,
          click_count = excluded.click_count,
          updated_at = now()
        returning id
      `;

      // Give roughly a third of the board 24h momentum so the change column,
      // the arrows and the top strip all have something to render against.
      if (i % 3 === 0) {
        const gained = Math.max(100, Math.round((l.totalCents * 0.12) / 100) * 100);
        await tx`
          insert into payments
            (listing_id, domain, amount_cents, status, stripe_session_id, paid_at)
          values (${row.id}, ${l.domain}, ${Math.min(gained, 500000)}, 'paid',
                  ${`seed_${l.domain}`}, now() - interval '3 hours')
          on conflict (stripe_session_id) do nothing
        `;
      }
    }
  });
    console.log(`seeded ${listings.length} listings`);
  } catch (err) {
    console.error("seed failed:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
