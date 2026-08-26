import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDomain } from "../src/lib/domain";

function ok(input: string): string {
  const r = normalizeDomain(input);
  assert.equal(r.ok, true, `expected ${input} to normalise, got: ${JSON.stringify(r)}`);
  return (r as { ok: true; domain: string }).domain;
}

function rejected(input: string) {
  const r = normalizeDomain(input);
  assert.equal(r.ok, false, `expected ${input} to be rejected`);
}

test("the PRD's own example shape collapses to one listing", () => {
  // The PRD writes this as example.com, which is blocklisted, so the same
  // shape is exercised against a domain we would actually accept.
  assert.equal(ok("https://WWW.Cloudflare.com/pricing?ref=x"), ok("cloudflare.com"));
});

test("scheme, www, path, query, fragment and case are all stripped", () => {
  for (const input of [
    "Stripe.com",
    "https://stripe.com",
    "http://www.stripe.com/",
    "stripe.com/docs/api",
    "https://www.STRIPE.com/docs?a=1#b",
    "  stripe.com  ",
    "https://stripe.com:8443/x",
  ]) {
    assert.equal(ok(input), "stripe.com", input);
  }
});

test("subdomains collapse to the registrable domain", () => {
  assert.equal(ok("blog.stripe.com"), "stripe.com");
  assert.equal(ok("a.b.c.stripe.com"), "stripe.com");
});

test("multi-part public suffixes keep their registrable label", () => {
  assert.equal(ok("bbc.co.uk"), "bbc.co.uk");
  assert.equal(ok("https://www.bbc.co.uk/news"), "bbc.co.uk");
});

test("IPs, localhost and internal TLDs are refused", () => {
  for (const bad of [
    "127.0.0.1",
    "http://192.168.1.1/admin",
    "localhost",
    "http://localhost:3000",
    "[::1]",
    "printer.local",
    "thing.internal",
    "site.test",
  ]) {
    rejected(bad);
  }
});

test("things that are not registrable domains are refused", () => {
  for (const bad of ["", "   ", "com", "co.uk", "not a domain", "a".repeat(300), "just-a-word"]) {
    rejected(bad);
  }
});

test("the blocklist is enforced", () => {
  rejected("example.com");
  rejected("https://www.example.org/anything");
});
