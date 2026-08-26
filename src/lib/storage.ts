import { getSql } from "./db";

export type StoredFavicon = { url: string | null; bytes: Buffer | null };

/**
 * Favicons are served from our own origin, never hotlinked. Where they are
 * kept depends on what the deployment has: Vercel Blob when a token is
 * present, otherwise a bytea column, which keeps a self-hosted setup to a
 * single dependency.
 */
export async function storeFavicon(
  domain: string,
  png: Buffer,
): Promise<StoredFavicon> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`favicons/${domain}.png`, png, {
        access: "public",
        token,
        contentType: "image/png",
        allowOverwrite: true,
        addRandomSuffix: false,
      });
      return { url: blob.url, bytes: null };
    } catch (err) {
      console.error("blob upload failed, falling back to postgres", err);
    }
  }
  return { url: `/api/favicon/${domain}`, bytes: png };
}

export async function readFaviconBytes(domain: string): Promise<Buffer | null> {
  const sql = getSql();
  const rows = await sql<{ favicon_bytes: Buffer | null }[]>`
    select favicon_bytes from listings where domain = ${domain} limit 1
  `;
  return rows[0]?.favicon_bytes ?? null;
}
