import { parse } from "tldts";

export type NormalizeResult =
  | { ok: true; domain: string }
  | { ok: false; reason: string };

const BLOCKED_TLDS = new Set([
  "local",
  "localhost",
  "internal",
  "test",
  "example",
  "invalid",
  "onion",
  "zip",
  "mov",
]);

// Domains we will not list. Keep this small and specific; the admin route is
// the general-purpose tool for abuse.
const BLOCKED_DOMAINS = new Set<string>([
  "localhost",
  "example.com",
  "example.org",
  "example.net",
]);

/**
 * Normalise anything a person might paste into the domain field down to a
 * registrable domain, or explain why it cannot be one.
 *
 * `https://WWW.Example.com/pricing?ref=x` and `example.com` both land on
 * `example.com`, which is the unique key and also what we display.
 */
export function normalizeDomain(input: string): NormalizeResult {
  if (typeof input !== "string") return { ok: false, reason: "Enter a domain." };

  let value = input.trim().toLowerCase();
  if (!value) return { ok: false, reason: "Enter a domain." };
  if (value.length > 253) return { ok: false, reason: "That domain is too long." };

  // tldts handles the scheme, path, query, fragment and port, but it wants
  // something URL-shaped to do it reliably.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;

  let parsed;
  try {
    parsed = parse(value, { allowPrivateDomains: false });
  } catch {
    return { ok: false, reason: "That is not a valid domain." };
  }

  if (parsed.isIp) return { ok: false, reason: "IP addresses cannot be listed." };
  if (!parsed.hostname) return { ok: false, reason: "That is not a valid domain." };
  if (parsed.hostname === "localhost")
    return { ok: false, reason: "Local addresses cannot be listed." };

  const suffix = parsed.publicSuffix ?? "";
  const lastLabel = suffix.split(".").pop() ?? "";
  if (BLOCKED_TLDS.has(lastLabel))
    return { ok: false, reason: `Domains ending in .${lastLabel} cannot be listed.` };

  // A registrable domain is the public suffix plus one label. tldts returns
  // null when the hostname is only a suffix, or is not a real suffix at all.
  const domain = parsed.domain;
  if (!domain)
    return { ok: false, reason: "That is not a registrable domain." };
  if (!parsed.isIcann)
    return { ok: false, reason: "That top-level domain is not recognised." };
  if (BLOCKED_DOMAINS.has(domain))
    return { ok: false, reason: "That domain is on the blocklist." };
  if (!/^[a-z0-9.-]+$/.test(domain))
    return { ok: false, reason: "That domain contains characters we cannot list." };

  return { ok: true, domain };
}
