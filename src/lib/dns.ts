import { resolve4, resolve6 } from "node:dns/promises";

/**
 * Does this domain resolve? Checked before we take money for it, so a click
 * has somewhere to land. Server-only: kept out of lib/domain.ts because the
 * claim form imports the normaliser into the browser bundle.
 */
export async function domainResolves(domain: string): Promise<boolean> {
  const records = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  return records.some((r) => r.status === "fulfilled" && r.value.length > 0);
}
