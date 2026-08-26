import sharp from "sharp";
import { letterTileColor } from "./color";
import { getSql } from "./db";
import { storeFavicon } from "./storage";

const FETCH_TIMEOUT_MS = 3000;
const REFETCH_AFTER_DAYS = 30;
const SIZE = 64;
const UA = "tilemarket-favicon/1.0 (+https://github.com/brandon-lai/tilemarket)";

async function fetchWithTimeout(url: string, accept: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type IconCandidate = { href: string; area: number };

/**
 * Pull icon links out of a page head without a DOM parser. Favicon markup is
 * simple enough that a regex over <link> tags is honest here, and it keeps a
 * 5MB HTML parser off the serverless bundle.
 */
function extractIconLinks(html: string, base: string, rels: RegExp): IconCandidate[] {
  const head = html.slice(0, 200_000);
  const out: IconCandidate[] = [];
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!rels.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(tag)?.[1];
    if (!href) continue;
    const sizes = /\bsizes\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1] ?? "";
    const dim = /(\d+)\s*x\s*(\d+)/i.exec(sizes);
    const area = dim ? Number(dim[1]) * Number(dim[2]) : 0;
    try {
      out.push({ href: new URL(href, base).toString(), area });
    } catch {
      // Ignore hrefs that are not resolvable against the page URL.
    }
  }
  return out.sort((a, b) => b.area - a.area);
}

async function toPng(input: Buffer): Promise<Buffer | null> {
  try {
    // A large share of favicons are white-on-transparent and vanish against a
    // light tile, so everything is composited onto a light neutral square.
    return await sharp(input, { animated: false })
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .flatten({ background: { r: 244, g: 244, b: 242 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function tryIcon(url: string): Promise<Buffer | null> {
  const res = await fetchWithTimeout(url, "image/*");
  if (!res) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > 2_000_000) return null;
  return toPng(buf);
}

async function letterFallback(domain: string): Promise<Buffer> {
  const letter = (domain[0] ?? "?").toUpperCase();
  const color = letterTileColor(domain);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${color}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
      font-family="Helvetica,Arial,sans-serif" font-size="34" font-weight="700"
      fill="#ffffff">${letter.replace(/[<&>]/g, "")}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Fallback chain, first success wins. Every step talks only to the target
 * site, so there is no third-party favicon service to go stale on us.
 *
 *  1. <link rel="apple-touch-icon">, largest declared size
 *  2. <link rel="icon"> / "shortcut icon", largest declared size
 *  3. /apple-touch-icon.png at the root
 *  4. /favicon.ico at the root
 *  5. a generated letter tile
 */
export async function resolveFavicon(
  domain: string,
): Promise<{ png: Buffer; ok: boolean }> {
  const origins = [`https://${domain}`, `http://${domain}`];

  for (const origin of origins) {
    const page = await fetchWithTimeout(origin, "text/html");
    if (page) {
      const html = await page.text().catch(() => "");
      const finalUrl = page.url || origin;
      const apple = extractIconLinks(html, finalUrl, /apple-touch-icon/);
      const generic = extractIconLinks(html, finalUrl, /(^|\s)(shortcut\s+)?icon(\s|$)/);
      for (const candidate of [...apple, ...generic]) {
        const png = await tryIcon(candidate.href);
        if (png) return { png, ok: true };
      }
    }
    for (const path of ["/apple-touch-icon.png", "/favicon.ico"]) {
      const png = await tryIcon(`${origin}${path}`);
      if (png) return { png, ok: true };
    }
    if (page) break; // The site answered; do not retry the whole chain on http.
  }

  return { png: await letterFallback(domain), ok: false };
}

/**
 * Background job. Never awaited by checkout or by page render: a listing goes
 * live immediately with the letter fallback and upgrades when this finishes.
 */
export async function refreshFavicon(domain: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ favicon_fetched_at: Date | null }[]>`
    select favicon_fetched_at from listings where domain = ${domain} limit 1
  `;
  if (rows.length === 0) return;
  const last = rows[0].favicon_fetched_at;
  if (last && Date.now() - last.getTime() < REFETCH_AFTER_DAYS * 86_400_000) return;

  try {
    const { png, ok } = await resolveFavicon(domain);
    const stored = await storeFavicon(domain, png);
    await sql`
      update listings set
        favicon_url = ${stored.url},
        favicon_bytes = ${stored.bytes},
        favicon_state = ${ok ? "ok" : "failed"},
        favicon_fetched_at = now(),
        updated_at = now()
      where domain = ${domain}
    `;
  } catch (err) {
    console.error(`favicon refresh failed for ${domain}`, err);
    await sql`
      update listings
      set favicon_state = 'failed', favicon_fetched_at = now()
      where domain = ${domain}
    `.catch(() => {});
  }
}
