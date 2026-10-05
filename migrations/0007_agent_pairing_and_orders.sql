-- Agent pairing: connects headless agent sessions to user profiles
create table if not exists agent_pairings (
  code text primary key,
  user_id text not null,
  agent_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);

create index if not exists agent_pairings_user_idx on agent_pairings (user_id);
create index if not exists agent_pairings_token_idx on agent_pairings (agent_token);

-- x402 audio export orders: MP3 ($20/hr) and FLAC ($45/hr with optional spatial stems)
create table if not exists export_orders (
  id text primary key,
  user_id text,
  template_id text,
  title text not null default 'Lumen Bath',
  artist text not null default 'Lumen Bath',
  album text not null default 'Lumen Bath Master Series',
  format text not null,
  duration_minutes integer not null,
  include_stems boolean not null default false,
  amount_usd numeric(10, 2) not null,
  amount_cents integer not null,
  status text not null default 'pending',
  payment_token text not null,
  payment_tx text,
  scene_data jsonb not null,
  eta_seconds integer not null default 0,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists export_orders_status_idx on export_orders (status, created_at desc);
create index if not exists export_orders_user_idx on export_orders (user_id, created_at desc);
create index if not exists export_orders_payment_token_idx on export_orders (payment_token);
