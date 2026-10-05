-- Shared baths. Embeddings live in jsonb (a unit vector). Cosine similarity
-- runs in the app server: preview Postgres cannot load extensions, so there
-- is no pgvector type here. Neon uses the same columns.

create table if not exists profiles (
  user_id text primary key,
  username text not null,
  bio text not null default '',
  website text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

create table if not exists templates (
  id text primary key,
  user_id text,
  title text not null,
  description text not null default '',
  settings jsonb not null,
  receiver jsonb not null,
  embedding jsonb not null,
  plays integer not null default 0,
  shares integer not null default 0,
  kind text not null default 'track',
  day text,
  parent_id text,
  stamp text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_kind_chk check (kind in ('track', 'daily', 'consensus'))
);

create index if not exists templates_kind_plays_idx on templates (kind, plays desc, created_at desc);
create index if not exists templates_user_idx on templates (user_id, created_at desc);

create table if not exists template_bowls (
  template_id text not null references templates (id) on delete cascade,
  bowl_index integer not null,
  frequency double precision not null,
  size double precision not null,
  height double precision not null,
  glass text not null,
  gain double precision not null,
  x double precision not null,
  y double precision not null,
  sing double precision not null,
  muted boolean not null default false,
  primary key (template_id, bowl_index)
);

create table if not exists comments (
  id text primary key,
  template_id text not null references templates (id) on delete cascade,
  user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_template_idx on comments (template_id, created_at);

-- Heat map of where bowls are played, selected, and placed. The latest
-- template is rebuilt from these cells.
create table if not exists placement_signals (
  cell_x smallint not null,
  cell_y smallint not null,
  glass text not null,
  freq_bin smallint not null,
  plays integer not null default 0,
  selects integer not null default 0,
  places integer not null default 0,
  size_sum double precision not null default 0,
  height_sum double precision not null default 0,
  sing_sum double precision not null default 0,
  gain_sum double precision not null default 0,
  n integer not null default 0,
  primary key (cell_x, cell_y, glass, freq_bin)
);
