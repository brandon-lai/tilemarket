import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
  max: 1,
});

const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");

async function main() {
  try {
    await sql.unsafe(schema);
    console.log("schema applied");
  } catch (err) {
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
