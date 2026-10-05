-- Thumbs on the preset switcher. Up votes pull a preset toward the
-- daily bath. Down votes push it back. Plays and saves still count.

alter table preset_stats add column if not exists ups integer not null default 0;
alter table preset_stats add column if not exists downs integer not null default 0;
