import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — tilemarket",
  description: "What you are buying, and what we can take away.",
};

export default function Terms() {
  return (
    <main className="wrap" style={{ maxWidth: 680 }}>
      <header className="masthead">
        <h1 className="rule-line">Terms</h1>
        <p className="rule-sub">
          Short, because there is not much to it. <a href="/">Back to the board</a>.
        </p>
      </header>

      <h2>What you are buying</h2>
      <p>
        Space on a public board. Your tile&rsquo;s area is proportional to the total
        you have paid against that domain, relative to everyone else. Pay more and
        your tile grows. Somebody else paying more shrinks yours. That is the entire
        product.
      </p>

      <h2>What you are not buying</h2>
      <p>
        Not an endorsement, not a review, not a quality signal, not traffic, and not
        a guaranteed number of clicks. Placement here is bought. We say so on the
        landing page because it is the honest description.
      </p>

      <h2>Removal</h2>
      <p>
        A listing can be hidden or removed for abuse — malware, fraud,
        impersonation, illegal content, or anything that makes this board a liability
        — at our discretion and without a refund. Payment records are kept when a
        listing is removed. Every listing has a report link and we read the reports.
      </p>

      <h2>Money</h2>
      <p>
        Payments are processed by Stripe. We never see or store card details.
        Amounts are in US dollars. A domain&rsquo;s total does not decrease and does
        not expire; there is no subscription and nothing to cancel. Refunds are
        handled by hand, by email, and are not guaranteed.
      </p>

      <h2>Privacy</h2>
      <p>
        No account, no email, no login. Clicks are counted once per visitor per
        listing per day using a salted hash that rotates daily. Raw IP addresses are
        never written down. Everything about a listing — the domain, the amount, the
        click count — is public, and that is the point.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:hello@tilemarket.dev">hello@tilemarket.dev</a>
      </p>
    </main>
  );
}
