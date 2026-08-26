import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __tilemarket_sql: postgres.Sql | undefined;
}

/**
 * The board runs without a database, on a deterministic demo dataset, so a
 * fresh deploy shows something real before DATABASE_URL is wired up. Every
 * write path checks this and refuses rather than pretending to have worked.
 */
export const hasDatabase = Boolean(process.env.DATABASE_URL);

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    // Postgres bigint arrives as a string by default so nothing is silently
    // truncated. Every bigint here is a cent count or a counter that fits in
    // a double comfortably, so parsing to number is safe and saves casts.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number) => String(v),
        parse: (v: string) => Number(v),
      },
    },
  });
}

/**
 * Connect lazily. In demo mode there is no URL to connect with, and importing
 * this module must still succeed.
 *
 * Next.js dev reloads the module graph on every edit, so the handle is cached
 * on globalThis. Without that the pool count climbs until Postgres refuses
 * connections.
 */
export function getSql(): postgres.Sql {
  if (global.__tilemarket_sql) return global.__tilemarket_sql;
  const handle = connect();
  global.__tilemarket_sql = handle;
  return handle;
}
