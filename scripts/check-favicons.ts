import "dotenv/config";
import { resolveFavicon } from "../src/lib/favicon";

// Real sites, chosen to hit different rungs of the fallback chain, plus one
// that cannot resolve at all so the letter fallback is exercised.
const domains = [
  "stripe.com",
  "github.com",
  "news.ycombinator.com",
  "vercel.com",
  "thisdomainshouldnotexist-tilemarket.com",
];

async function main() {
  for (const d of domains) {
    const started = Date.now();
    const { png, ok } = await resolveFavicon(d);
    const ms = Date.now() - started;
    const sharp = (await import("sharp")).default;
    const meta = await sharp(png).metadata();
    console.log(
      `${ok ? "fetched " : "fallback"}  ${d.padEnd(42)} ${meta.width}x${meta.height} ${meta.format} ${String(png.byteLength).padStart(6)}B ${ms}ms`,
    );
  }
}

main();
