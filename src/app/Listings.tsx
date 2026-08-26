"use client";

import { useState } from "react";
import type { Listing } from "@/lib/board";
import { letterTileColor } from "@/lib/color";
import { formatCents, formatCount, formatPercent } from "@/lib/money";

/**
 * Every listing, including the ones that never made it onto the board.
 * This is where the tail lives, and it is what makes a $1 listing worth
 * buying at all.
 */
export default function Listings({
  listings,
  onOutbid,
}: {
  listings: Listing[];
  onOutbid: (domain: string) => void;
}) {
  const [reporting, setReporting] = useState<string | null>(null);

  return (
    <section aria-labelledby="all-listings">
      <div className="listings-head">
        <h2 id="all-listings">Every listing</h2>
        <span className="num" style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {formatCount(listings.length)}
        </span>
      </div>
      <div className="table-scroll">
        <table className="listings">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th>Domain</th>
              <th className="col-num">Paid</th>
              <th className="col-num">Clicks</th>
              <th className="col-num">24h</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--ink-2)", padding: "18px 8px" }}>
                  No listings yet. Claim the first tile and you own the entire board
                  until somebody outbids you.
                </td>
              </tr>
            )}
            {listings.map((l, i) => {
              // Coloured by the number in this cell, not by share change:
              // a red arrow beside "0.0%" reads as broken.
              const change = l.change24h ?? 0;
              const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
              return (
                <tr key={l.domain}>
                  <td className="col-rank num">{i + 1}</td>
                  <td>
                    <span className="cell-domain">
                      {l.faviconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.faviconUrl} alt="" width={18} height={18} />
                      ) : (
                        <span
                          className="tile__letter"
                          style={{ background: letterTileColor(l.domain) }}
                          aria-hidden="true"
                        >
                          {l.domain[0]?.toUpperCase()}
                        </span>
                      )}
                      <a href={`/go/${l.id}`} rel="nofollow noopener">
                        {l.domain}
                      </a>
                    </span>
                  </td>
                  <td className="col-num num">{formatCents(l.totalCents)}</td>
                  <td className="col-num num">{formatCount(l.clickCount)}</td>
                  <td className={`col-num num delta--${dir}`}>
                    <span aria-hidden="true">
                      {dir === "up" ? "▲ " : dir === "down" ? "▼ " : "– "}
                    </span>
                    {l.change24h === null ? "new" : formatPercent(l.change24h)}
                  </td>
                  <td className="col-num">
                    <button
                      type="button"
                      className="outbid"
                      onClick={() => onOutbid(l.domain)}
                    >
                      Outbid
                    </button>
                  </td>
                  <td className="col-num">
                    <button
                      type="button"
                      className="report-link"
                      onClick={() => setReporting(l.id)}
                    >
                      Report
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {reporting && (
        <ReportDialog listingId={reporting} onClose={() => setReporting(null)} />
      )}
    </section>
  );
}

function ReportDialog({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send() {
    setState("sending");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, reason }),
    });
    if (res.ok) {
      setState("sent");
      setTimeout(onClose, 1400);
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "That report could not be sent. Try again.");
      setState("error");
    }
  }

  return (
    <div className="notice" role="dialog" aria-label="Report a listing">
      {state === "sent" ? (
        <p style={{ margin: 0 }}>Reported. We read these.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>What is wrong with this listing?</p>
          <div className="claim" style={{ margin: 0 }}>
            <div className="field">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Malware, scam, impersonation…"
                autoFocus
              />
            </div>
            <button type="button" onClick={send} disabled={state === "sending"}>
              Send report
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "transparent", color: "var(--ink)" }}
            >
              Cancel
            </button>
          </div>
          {state === "error" && (
            <p style={{ margin: "8px 0 0", color: "var(--down)" }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}
