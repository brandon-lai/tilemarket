"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const box = el.getBoundingClientRect();
      const next = { w: Math.round(box.width), h: Math.round(box.height) };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };

    // Measure synchronously on mount. Waiting for the first ResizeObserver
    // callback leaves the board blank for a frame, and in environments that
    // never fire one it stays blank forever.
    measure();
    const ro = new ResizeObserver(measure);
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

  // The spec wants the favicon above the domain and the domain shown from
  // 24px of height. Those two rules cannot both hold: a 20px icon plus its
  // margin is already 24px, so on a short tile the icon would push the domain
  // out of view entirely. Text wins on short tiles, because a tile with no
  // name on it is worth nothing to the person who paid for it. The icon comes
  // back as soon as there is room for it and all three lines, and a tile too
  // small for any text at all shows the icon alone as its only identity.
  const showIcon = showDomain ? h > 78 : w >= 26 && h >= 26;

  // The top strip tracks share of the board, which is what actually moved
  // when somebody else paid. The number below it is the listing's own change.
  //
  // A dead band around zero matters here: without it every listing that
  // simply had a quiet day shows red, because somebody else's payment diluted
  // it by a rounding error, and the board becomes a wall of red that says
  // nothing.
  const strip =
    l.gained24hCents > 0
      ? "up"
      : l.shareDelta < -0.0015
        ? "down"
        : "flat";
  const change = l.change24h ?? 0;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";

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
      <span className={`tile__strip tile__strip--${strip}`} aria-hidden="true" />
      <span className={`tile__body${showIcon ? "" : " tile__body--tight"}`}>
        {showIcon &&
          (l.faviconUrl ? (
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
          ))}
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
