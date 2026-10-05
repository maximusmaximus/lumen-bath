-- Pairing events for Cast. The bath itself still plays on each screen.
-- These rows only carry the controller's scene, and recording start and stop.

create table if not exists cast_events (
  id bigserial primary key,
  room text not null,
  from_peer text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cast_events_room on cast_events (room, id);
