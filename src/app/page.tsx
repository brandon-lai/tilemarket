import Market from "./Market";
import { loadBoard } from "@/lib/board";
import { hasDatabase } from "@/lib/db";
import { hasStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const board = await loadBoard();

  return (
    <main className="wrap">
      <header className="masthead">
        <h1 className="rule-line">Rank is bought, not earned.</h1>
        <p className="rule-sub">
          Pay to list a domain. Your tile&rsquo;s area is the amount you paid. Pay
          again and it grows. Nothing here is vetted, recommended, or ordered by
          anything except money.
        </p>
      </header>

      <Market
        initial={board}
        paymentsEnabled={hasDatabase && hasStripe}
        claimedDomain={one(params.claimed)}
        paymentId={one(params.payment)}
        cancelledDomain={one(params.cancelled)}
      />

      <footer className="site">
        <a href="/terms">Terms</a>
        <a href="mailto:hello@tilemarket.dev">Contact</a>
        <span>
          Every listing is an ad the lister paid for. Placement is paid and is not an
          endorsement.
        </span>
      </footer>
    </main>
  );
}
