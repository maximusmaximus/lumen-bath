create table if not exists feedback_challenges (
  id text primary key,
  answer text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null
);

create table if not exists feedback_reports (
  id text primary key,
  kind text not null check (kind in ('bug', 'feature')),
  title text not null,
  body text not null,
  contact text not null default '',
  status text not null check (status in ('local', 'issue', 'draft', 'spam')),
  summary text not null default '',
  proposal text not null default '',
  issue_url text,
  issue_number integer,
  pr_url text,
  pr_number integer,
  note text not null default '',
  reporter_id text,
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_created_idx on feedback_reports (created_at desc);
