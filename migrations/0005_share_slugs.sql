alter table templates add column if not exists user_slug text;
alter table templates add column if not exists slug text;
alter table templates add column if not exists ears jsonb not null default '[]'::jsonb;

create unique index if not exists templates_share_slug_idx
  on templates (user_slug, slug)
  where user_slug is not null and slug is not null;
