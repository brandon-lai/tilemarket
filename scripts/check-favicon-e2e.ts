import "dotenv/config";
import { getSql } from "../src/lib/db";
import { refreshFavicon } from "../src/lib/favicon";

/** Fetch, normalise, store and read back one real favicon end to end. */
async function main() {
  const domain = process.argv[2] ?? "stripe.com";
  const sql = getSql();
  await sql`
    insert into listings (domain, total_cents) values (${domain}, 500)
    on conflict (domain) do update set favicon_fetched_at = null
  `;
  await refreshFavicon(domain);
  const [row] = await sql`
    select favicon_state, favicon_url, octet_length(favicon_bytes) as bytes
    from listings where domain = ${domain}
  `;
  console.log(row);
  await sql.end();
}

main();
