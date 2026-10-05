-- How often each built-in preset is played or saved. The daily bath
-- reads this so the setup of the day follows what people actually use.

create table if not exists preset_stats (
  preset_id text primary key,
  plays integer not null default 0,
  saves integer not null default 0,
  stem_saves integer not null default 0,
  updated_at timestamptz not null default now()
);
