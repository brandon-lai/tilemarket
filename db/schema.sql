-- tilemarket schema. Amounts are integer cents everywhere. Never a float.

create extension if not exists "pgcrypto";

create table if not exists listings (
  id             uuid primary key default gen_random_uuid(),
  domain         text unique not null,
  total_cents    bigint not null default 0,
  click_count    bigint not null default 0,
  favicon_url    text,
  favicon_state  text not null default 'pending',
  favicon_bytes  bytea,
  favicon_fetched_at timestamptz,
  status         text not null default 'live',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint listings_favicon_state_check check (favicon_state in ('pending','ok','failed')),
  constraint listings_status_check check (status in ('live','hidden','removed')),
  constraint listings_total_nonneg check (total_cents >= 0)
);

create table if not exists payments (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid references listings(id),
  domain            text not null,
  amount_cents      bigint not null,
  status            text not null,
  stripe_session_id text unique not null,
  stripe_event_id   text unique,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  constraint payments_status_check check (status in ('pending','paid','failed','refunded')),
  constraint payments_amount_range check (amount_cents >= 100 and amount_cents <= 500000)
);

create table if not exists clicks (
  id         bigserial primary key,
  listing_id uuid not null references listings(id),
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id         bigserial primary key,
  listing_id uuid not null references listings(id),
  reason     text not null,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index if not exists listings_total_cents_idx on listings (total_cents desc);
create index if not exists payments_listing_id_idx  on payments (listing_id);
create index if not exists payments_paid_at_idx     on payments (paid_at) where status = 'paid';
create index if not exists clicks_listing_created_idx on clicks (listing_id, created_at);

-- One click per ip_hash per listing per day. The salt inside ip_hash rotates
-- daily, so the same visitor hashes differently tomorrow and this single
-- unique index is exactly a per-day cap. Enforcing it in the database means
-- two concurrent requests cannot both slip through.
create unique index if not exists clicks_daily_unique_idx
  on clicks (listing_id, ip_hash);
