"use client";

import { useCallback, useEffect, useState } from "react";
import Board from "./Board";
import ClaimForm from "./ClaimForm";
import Listings from "./Listings";
import type { BoardData } from "@/lib/board";
import { formatCents, formatCount } from "@/lib/money";

const POLL_MS = 10_000;

export default function Market({
  initial,
  paymentsEnabled,
  claimedDomain,
  paymentId,
  cancelledDomain,
}: {
  initial: BoardData;
  paymentsEnabled: boolean;
  claimedDomain: string | null;
  paymentId: string | null;
  cancelledDomain: string | null;
}) {
  const [board, setBoard] = useState(initial);
  const [prefill, setPrefill] = useState("");

  // Poll and diff. A websocket for a board that changes a few times an hour
  // is a lot of moving parts to maintain for no visible gain.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as BoardData;
        if (!cancelled) setBoard(next);
      } catch {
        // A dropped poll is not worth surfacing; the next one is 10s away.
      }
    };
    const id = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const onOutbid = useCallback((domain: string) => setPrefill(domain), []);
  const onPrefillConsumed = useCallback(() => setPrefill(""), []);

  return (
    <>
      <Counters board={board} />

      <ClaimForm
        prefillDomain={prefill}
        onPrefillConsumed={onPrefillConsumed}
        enabled={paymentsEnabled}
      />
      <p className="hint">
        $1 minimum, $5,000 maximum per payment. Paying again on the same domain adds
        to its total. No account, no email.
        {!paymentsEnabled && " Payments are not configured on this deployment yet."}
        {board.demo && " The listings below are a generated example, not real ones."}
      </p>

      {claimedDomain && paymentId && (
        <ClaimStatus domain={claimedDomain} paymentId={paymentId} />
      )}
      {cancelledDomain && (
        <p className="notice">
          Checkout for <strong>{cancelledDomain}</strong> was cancelled. Nothing was
          charged.
        </p>
      )}

      <Board
        listings={board.listings}
        exponent={board.treemapExponent}
        claimedDomain={claimedDomain}
        onOutbid={onOutbid}
      />

      <p className="legend">
        <span>Tile area = amount paid.</span>
        <span>Darker = larger total.</span>
        <span className="delta--up">▲ gained share in 24h</span>
        <span className="delta--down">▼ lost share</span>
        <span style={{ color: "var(--accent)" }}>outlined = spotlight, rotating</span>
      </p>

      <Listings listings={board.listings} onOutbid={onOutbid} />
    </>
  );
}

function Counters({ board }: { board: BoardData }) {
  return (
    <dl className="counters">
      <div className="counter">
        <dt>Total collected</dt>
        <dd className="num">{formatCents(board.totalCents)}</dd>
      </div>
      <div className="counter">
        <dt>Listings</dt>
        <dd className="num">{formatCount(board.listingCount)}</dd>
      </div>
      <div className="counter">
        <dt>Top listing</dt>
        <dd>{board.topDomain ?? "—"}</dd>
      </div>
      <div className="counter">
        <dt>Visitors online</dt>
        <dd className="num">{formatCount(board.visitorsOnline)}</dd>
      </div>
    </dl>
  );
}

/**
 * The redirect back from Stripe is not proof of payment. This polls the
 * payment row until the webhook has actually credited it.
 */
function ClaimStatus({ domain, paymentId }: { domain: string; paymentId: string }) {
  const [status, setStatus] = useState<string>("pending");

  useEffect(() => {
    if (status === "paid" || status === "failed") return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/payment/${paymentId}`, { cache: "no-store" });
        const data = (await res.json()) as { status?: string };
        if (!stop && data.status) setStatus(data.status);
      } catch {
        // Keep waiting; the interval will try again.
      }
    };
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [paymentId, status]);

  if (status === "paid") {
    return (
      <p className="notice notice--ok" role="status">
        Claimed. <strong>{domain}</strong> is on the board.
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="notice" role="status">
        That payment did not go through, so <strong>{domain}</strong> was not
        credited. Try again, or use a different card.
      </p>
    );
  }
  return (
    <p className="notice" role="status">
      Payment received. Waiting for Stripe to confirm it before{" "}
      <strong>{domain}</strong> goes on the board. This page updates itself.
    </p>
  );
}
