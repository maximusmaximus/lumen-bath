-- Which presets and tags people open. A week of this is the brief
-- for the next AI-generated set.

create table if not exists preset_picks (
  id bigserial primary key,
  preset_id text not null default '',
  tag text,
  kind text not null default 'open',
  source text not null default 'house',
  week text not null,
  created_at timestamptz not null default now()
);

create index if not exists preset_picks_week on preset_picks (week, preset_id);

create table if not exists preset_weeks (
  week text primary key,
  used_venice boolean not null default false,
  proposal text not null,
  created_at timestamptz not null default now()
);