import Stripe from "stripe";

let client: Stripe | null = null;

export const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) {
    client = new Stripe(key, {
      // Pinned to the version the installed SDK's types are generated from,
      // so a future SDK bump is a deliberate, type-checked change.
      apiVersion: "2025-08-27.basil",
      typescript: true,
      appInfo: { name: "tilemarket", version: "1.0.0" },
    });
  }
  return client;
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
