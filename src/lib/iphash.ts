import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Raw IPs are never stored. The salt rotates daily, which both anonymises the
 * value and makes a unique index on (listing_id, ip_hash) mean exactly
 * "one click per visitor per listing per day".
 */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET ?? "tilemarket-dev-salt";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${day}:${secret}:${ip}`).digest("hex");
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export function hashedClientIp(req: NextRequest): string {
  return hashIp(clientIp(req));
}
