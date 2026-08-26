"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "@/lib/board";
import { letterTileColor, rampStep } from "@/lib/color";
import { formatCentsCompact, formatPercent } from "@/lib/money";
import {
  SPOTLIGHT_AREA_SHARE,
  SPOTLIGHT_INTERVAL_MS,
  hourSeed,
  spotlightIndices,
  spotlightSlotCount,
  spotlightTick,
} from "@/lib/spotlight";
import { namedTileCount, squarify, weightsFor } from "@/lib/treemap";

type Props = {
  listings: Listing[];
  exponent: number;
  claimedDomain: string | null;
  onOutbid: (domain: string) => void;
};

type Placed = {
  key: string;
  listing: Listing | null;
  spotlight: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** The number of tiles that fit is a function of the canvas, so measure it. */
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function Board({ listings, exponent, claimedDomain, onOutbid }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const reduced = useReducedMotion();

  // Rotation is seeded from the wall clock and the hour, never from
  // Math.random. Two people looking at the board in the same minute see the
  // same thing, which is the whole point of a shared board.
  const [tick, setTick] = useState(() => spotlightTick());
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick(spotlightTick()), SPOTLIGHT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const layout = useMemo<Placed[]>(() => {
    if (w <= 0 || h <= 0 || listings.length === 0) return [];

    const named = listings.slice(0, Math.min(namedTileCount(w, h), listings.length));
    const tail = listings.slice(named.length);

    const namedWeights = weightsFor(
      named.map((l) => l.totalCents),
      exponent,
    );
    const namedWeightSum = namedWeights.reduce((s, v) => s + v, 0);

    const slots = spotlightSlotCount(tail.length);
    // Solve for the weight that makes each spotlight tile exactly
    // SPOTLIGHT_AREA_SHARE of the finished board.
    const denom = 1 - SPOTLIGHT_AREA_SHARE * slots;
    const spotlightWeight =
      slots > 0 && denom > 0 ? (SPOTLIGHT_AREA_SHARE * namedWeightSum) / denom : 0;

    const picks = spotlightIndices(tail.length, tick, hourSeed());

    const entries = [
      ...named.map((l, i) => ({
        key: l.domain,
        listing: l,
        spotlight: false,
        weight: namedWeights[i],
      })),
      ...Array.from({ length: slots }, (_, s) => ({
        // Keyed by slot, not by occupant: the slot stays put and its tenant
        // changes, rather than the whole board reshuffling every 5 seconds.
        key: `__spotlight_${s}`,
        listing: tail[picks[s]] ?? null,
        spotlight: true,
        weight: spotlightWeight,
      })),
    ].sort((a, b) => b.weight - a.weight);

    const rects = squarify(
      entries.map((e) => ({ key: e.key, weight: e.weight })),
      w,
      h,
    );
    const byKey = new Map(rects.map((r) => [r.key, r]));

    const gap = 2;
    return entries.flatMap((e) => {
      const r = byKey.get(e.key);
      if (!r) return [];
      return [
        {
          key: e.key,
          listing: e.listing,
          spotlight: e.spotlight,
          x: r.x,
          y: r.y,
          w: Math.max(0, r.w - gap),
          h: Math.max(0, r.h - gap),
        },
      ];
    });
  }, [listings, exponent, w, h, tick]);

  const [min, max] = useMemo(() => {
    if (listings.length === 0) return [1, 1];
    let lo = Infinity;
    let hi = 0;
    for (const l of listings) {
      if (l.totalCents < lo) lo = l.totalCents;
      if (l.totalCents > hi) hi = l.totalCents;
    }
    return [lo, hi];
  }, [listings]);

  return (
    <div className="board" ref={ref} role="list" aria-label="Paid listings, by amount">
      {listings.length === 0 && (
        <p className="board__empty">
          Nothing on the board yet. The first tile is the whole board.
        </p>
      )}
      {layout.map((t) => (
        <Tile
          key={t.key}
          placed={t}
          min={min}
          max={max}
          claimed={t.listing?.domain === claimedDomain}
          reduced={reduced}
          tick={tick}
          onOutbid={onOutbid}
        />
      ))}
    </div>
  );
}

function Tile({
  placed,
  min,
  max,
  claimed,
  reduced,
  tick,
  onOutbid,
}: {
  placed: Placed;
  min: number;
  max: number;
  claimed: boolean;
  reduced: boolean;
  tick: number;
  onOutbid: (domain: string) => void;
}) {
  const l = placed.listing;
  const { w, h } = placed;
  const step = l ? rampStep(l.totalCents, min, max) : 1;

  const style: React.CSSProperties = {
    left: placed.x,
    top: placed.y,
    width: w,
    height: h,
  };

  if (!l) {
    return (
      <div className="tile tile--s1 tile--spotlight" style={style} aria-hidden="true">
        <span className="tile__label">spotlight</span>
      </div>
    );
  }

  // Only draw what actually fits. These thresholds are the reason a $1 tile
  // still reads as a domain rather than as a grey smudge.
  const showDomain = w > 50 && h > 24;
  const showAmount = showDomain && h > 44;
  const showChange = showAmount && h > 66;

  const direction =
    placed.spotlight || l.shareDelta === 0 ? "flat" : l.shareDelta > 0 ? "up" : "down";

  return (
    <a
      className={[
        "tile",
        `tile--s${step}`,
        placed.spotlight ? "tile--spotlight" : "",
        claimed ? "tile--claimed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      href={`/go/${l.id}`}
      rel="nofollow noopener"
      role="listitem"
      title={`${l.domain} — ${formatCentsCompact(l.totalCents)}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onOutbid(l.domain);
      }}
    >
      <span className={`tile__strip tile__strip--${direction}`} aria-hidden="true" />
      <span className="tile__body">
        {l.faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tile__icon" src={l.faviconUrl} alt="" width={20} height={20} />
        ) : (
          <span
            className="tile__letter"
            style={{ background: letterTileColor(l.domain) }}
            aria-hidden="true"
          >
            {l.domain[0]?.toUpperCase()}
          </span>
        )}
        {showDomain && <span className="tile__domain">{l.domain}</span>}
        {showAmount && (
          <span className="tile__amount num">{formatCentsCompact(l.totalCents)}</span>
        )}
        {showChange && (
          <span className="tile__change num">
            {/* Never colour alone: the arrow carries the same information. */}
            <span aria-hidden="true">
              {direction === "up" ? "▲ " : direction === "down" ? "▼ " : "– "}
            </span>
            {l.change24h === null ? "new" : formatPercent(l.change24h)}
          </span>
        )}
      </span>
      {placed.spotlight && <span className="tile__label">spotlight</span>}
      {placed.spotlight && !reduced && (
        <span
          key={tick}
          className="tile__progress"
          style={{ animation: `spotlight-progress ${SPOTLIGHT_INTERVAL_MS}ms linear` }}
          aria-hidden="true"
        />
      )}
    </a>
  );
}
