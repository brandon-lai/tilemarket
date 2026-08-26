"use client";

import { useEffect, useId, useRef, useState } from "react";
import { normalizeDomain } from "@/lib/domain";
import { parseDollarsToCents } from "@/lib/money";

type Props = {
  prefillDomain: string;
  onPrefillConsumed: () => void;
  enabled: boolean;
};

export default function ClaimForm({ prefillDomain, onPrefillConsumed, enabled }: Props) {
  const [domain, setDomain] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const domainRef = useRef<HTMLInputElement>(null);
  const domainId = useId();
  const amountId = useId();

  useEffect(() => {
    if (!prefillDomain) return;
    setDomain(prefillDomain);
    setError(null);
    domainRef.current?.focus();
    domainRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    onPrefillConsumed();
  }, [prefillDomain, onPrefillConsumed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate with the same functions the server uses, so the message a
    // person sees for a bad domain is identical either way.
    const normalized = normalizeDomain(domain);
    if (!normalized.ok) return setError(normalized.reason);
    const cents = parseDollarsToCents(amount);
    if (!cents.ok) return setError(cents.reason);

    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: normalized.domain, amountCents: cents.cents }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Checkout could not be started. Try again.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("The network dropped that request. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="claim" onSubmit={submit} noValidate>
      <div className="field">
        <label className="sr-only" htmlFor={domainId}>
          Domain
        </label>
        <input
          id={domainId}
          ref={domainRef}
          name="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourdomain.com"
          autoComplete="url"
          spellCheck={false}
          inputMode="url"
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="field field--amount">
        <label className="sr-only" htmlFor={amountId}>
          Amount in US dollars
        </label>
        <input
          id={amountId}
          name="amount"
          className="num"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$25"
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
        />
      </div>
      <button type="submit" disabled={busy || !enabled}>
        {busy ? "Opening checkout…" : "Claim a tile"}
      </button>
      {error && (
        <p className="notice" role="alert" style={{ flex: "1 1 100%" }}>
          {error}
        </p>
      )}
    </form>
  );
}
