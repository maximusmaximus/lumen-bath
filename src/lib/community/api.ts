import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { DEFAULT_SETTINGS, PRESETS, getPreset, instantiatePreset, presetIsDownload } from "@/lib/audio/presets";
import type { Receiver, Settings } from "@/lib/audio/types";
import {
  averageReceiver,
  averageSettings,
  embedArrangement,
  freqToBin,
  houseBath,
  layoutFromWeighted,
  rankByVector,
  sanitizeBowls,
  sanitizeReceiver,
  sanitizeSettings,
  signalStamp,
  signalsToWeighted,
  cellIndex,
  type SignalRow,
  type WeightedBowl,
} from "@/lib/community/embed";
import { cleanId, cleanText, cleanUsername, cleanWebsite, dayLabel, isoWeek, utcDay } from "@/lib/community/text";
import type {
  CommunityBowl,
  CommunityCard,
  CommunityComment,
  CommunityTemplate,
  DashboardData,
  PresetStat,
  Profile,
  TemplateKind,
} from "@/lib/community/types";
import { shareCardPath, sharePath, slugify } from "@/lib/share/slug";
import { loadShare, sanitizeEars } from "@/lib/share/load.server";
import type { ShareView } from "@/lib/share/types";

export const LATEST_ID = "latest-template";

let writeGate: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeGate.then(task, task);
  writeGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

type TemplateRow = {
  id: string;
  user_id: string | null;
  title: string;
  description: string;
  settings: unknown;
  receiver: unknown;
  ears: unknown;
  embedding: unknown;
  plays: number | string;
  shares: number | string;
  kind: string;
  day: string | null;
  parent_id: string | null;
  stamp: string;
  created_at: string;
  username: string | null;
  user_slug: string | null;
  slug: string | null;
  bowls?: number | string;
};

function num(value: unknown, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function asVector(value: unknown): number[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((item) => num(item));
}

function kindOf(value: string): TemplateKind {
  if (value === "daily" || value === "consensus") return value;
  return "track";
}

function authorOf(username: string | null, kind: string): string {
  if (username && !username.includes("@")) return username;
  return kind === "track" ? "Listener" : "Lumen";
}

function cardFrom(row: TemplateRow, similarity?: number, viewerId?: string | null): CommunityCard {
  const card: CommunityCard = {
    id: row.id,
    title: row.title,
    description: row.description,
    plays: num(row.plays),
    shares: num(row.shares),
    kind: kindOf(row.kind),
    author: authorOf(row.username, row.kind),
    bowls: num(row.bowls),
    createdAt: String(row.created_at ?? ""),
    sharePath: row.user_slug && row.slug ? sharePath(row.user_slug, row.slug) : null,
    image: row.user_slug && row.slug ? shareCardPath(row.user_slug, row.slug) : null,
    mine: Boolean(viewerId && row.user_id && row.user_id === viewerId),
  };
  if (similarity !== undefined) card.similarity = similarity;
  return card;
}

const CARD_SQL = `
  select t.id, t.user_id, t.title, t.description, t.plays, t.shares, t.kind, t.day,
         t.parent_id, t.stamp, t.created_at::text as created_at, t.user_slug, t.slug, p.username,
         (select count(*) from template_bowls b where b.template_id = t.id) as bowls
  from templates t
  left join profiles p on p.user_id = t.user_id
`;

async function readBowls(sql: Sql, templateId: string): Promise<CommunityBowl[]> {
  const rows = await sql<{
    frequency: number;
    size: number;
    height: number;
    glass: string;
    gain: number;
    x: number;
    y: number;
    sing: number;
    muted: boolean | string;
  }>`
    select frequency, size, height, glass, gain, x, y, sing, muted
    from template_bowls
    where template_id = ${templateId}
    order by bowl_index asc
  `;
  return (
    sanitizeBowls(
      rows.map((row) => ({
        ...row,
        muted: row.muted === true || row.muted === "t" || row.muted === "true",
      })),
    ) ?? []
  );
}

async function writeBowls(sql: Sql, templateId: string, bowls: CommunityBowl[]) {
  await sql`delete from template_bowls where template_id = ${templateId}`;
  for (let index = 0; index < bowls.length; index += 1) {
    const bowl = bowls[index];
    await sql`
      insert into template_bowls (
        template_id, bowl_index, frequency, size, height, glass, gain, x, y, sing, muted
      ) values (
        ${templateId}, ${index}, ${bowl.frequency}, ${bowl.size}, ${bowl.height}, ${bowl.glass},
        ${bowl.gain}, ${bowl.x}, ${bowl.y}, ${bowl.sing}, ${bowl.muted}
      )
    `;
  }
}

async function upsertGenerated(
  sql: Sql,
  input: {
    id: string;
    kind: TemplateKind;
    day: string | null;
    stamp: string;
    title: string;
    description: string;
    settings: Settings;
    receiver: Receiver;
    bowls: CommunityBowl[];
  },
) {
  const embedding = JSON.stringify(embedArrangement(input.bowls, input.settings, input.receiver));
  const settings = JSON.stringify(input.settings);
  const receiver = JSON.stringify(input.receiver);
  await sql`
    insert into templates (
      id, user_id, title, description, settings, receiver, embedding, kind, day, stamp
    ) values (
      ${input.id}, ${null}, ${input.title}, ${input.description},
      ${settings}::jsonb, ${receiver}::jsonb, ${embedding}::jsonb,
      ${input.kind}, ${input.day}, ${input.stamp}
    )
    on conflict (id) do update set
      title = excluded.title,
      description = excluded.description,
      settings = excluded.settings,
      receiver = excluded.receiver,
      embedding = excluded.embedding,
      kind = excluded.kind,
      day = excluded.day,
      stamp = excluded.stamp,
      updated_at = now()
  `;
  await writeBowls(sql, input.id, input.bowls);
}

type SourceTrack = {
  id: string;
  plays: number;
  settings: Settings;
  receiver: Receiver;
  bowls: CommunityBowl[];
};

async function topPlayed(sql: Sql): Promise<SourceTrack[]> {
  const heads = await sql<{ id: string; plays: number | string; settings: unknown; receiver: unknown }>`
    select id, plays, settings, receiver
    from templates
    where kind in ('track', 'daily') and plays > 0
    order by plays desc, created_at desc
    limit 8
  `;
  const tracks: SourceTrack[] = [];
  for (const head of heads) {
    const bowls = await readBowls(sql, head.id);
    if (bowls.length < 3) continue;
    tracks.push({
      id: head.id,
      plays: Math.max(1, num(head.plays)),
      settings: sanitizeSettings(asObject(head.settings)),
      receiver: sanitizeReceiver(asObject(head.receiver)),
      bowls,
    });
  }
  return tracks;
}

function mixTracks(tracks: SourceTrack[]): { bowls: CommunityBowl[]; settings: Settings; receiver: Receiver } {
  const weighted: WeightedBowl[] = [];
  for (const track of tracks) {
    for (const bowl of track.bowls) {
      if (bowl.muted) continue;
      weighted.push({ ...bowl, weight: track.plays });
    }
  }
  return {
    bowls: layoutFromWeighted(weighted, 6),
    settings: averageSettings(tracks.map((track) => ({ settings: track.settings, weight: track.plays }))),
    receiver: averageReceiver(tracks.map((track) => ({ receiver: track.receiver, weight: track.plays }))),
  };
}

type PresetLeader = {
  id: string;
  plays: number;
  saves: number;
  stemSaves: number;
  ups: number;
  downs: number;
  score: number;
};

let votesReady = false;

async function ensurePresetVotes(sql: Sql) {
  if (votesReady) return;
  await sql`alter table preset_stats add column if not exists ups integer not null default 0`;
  await sql`alter table preset_stats add column if not exists downs integer not null default 0`;
  votesReady = true;
}

function presetScore(plays: number, saves: number, stemSaves: number, ups: number, downs: number) {
  return plays + saves * 3 + stemSaves * 2 + ups * 4 - downs * 3;
}

function knownPresetId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return getPreset(raw)?.id ?? null;
}

async function leadingPreset(sql: Sql): Promise<PresetLeader | null> {
  await ensurePresetVotes(sql);
  const rows = await sql<{
    preset_id: string;
    plays: number | string;
    saves: number | string;
    stem_saves: number | string;
    ups: number | string;
    downs: number | string;
  }>`
    select preset_id, plays, saves, stem_saves, ups, downs
    from preset_stats
    order by (plays + saves * 3 + stem_saves * 2 + ups * 4 - downs * 3) desc, ups desc, plays desc, saves desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const preset = getPreset(row.preset_id);
  if (!preset) return null;
  const plays = num(row.plays);
  const saves = num(row.saves);
  const stemSaves = num(row.stem_saves);
  const ups = num(row.ups);
  const downs = num(row.downs);
  const score = presetScore(plays, saves, stemSaves, ups, downs);
  if (score <= 0) return null;
  return { id: preset.id, plays, saves, stemSaves, ups, downs, score };
}

function presetMix(id: string): { bowls: CommunityBowl[]; settings: Settings; receiver: Receiver } {
  const made = instantiatePreset(id);
  const ear = made.ears[0];
  return {
    bowls: made.bowls.map((bowl) => ({
      frequency: bowl.frequency,
      size: bowl.size,
      height: bowl.height,
      glass: bowl.glass,
      gain: bowl.gain,
      x: bowl.x,
      y: bowl.y,
      sing: bowl.sing,
      muted: false,
    })),
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...made.settingsPatch }),
    receiver: sanitizeReceiver(ear ? { x: ear.x, y: ear.y, height: ear.height, yaw: ear.yaw } : {}),
  };
}

function describeLeader(leader: PresetLeader, blended: boolean): string {
  const preset = getPreset(leader.id);
  const name = preset?.name ?? leader.id;
  const download = preset && presetIsDownload(preset) ? " People are saving it as a full-stem download." : "";
  const counts = `${leader.plays} ${leader.plays === 1 ? "play" : "plays"}, ${leader.saves} ${leader.saves === 1 ? "save" : "saves"}, ${leader.ups} up, ${leader.downs} down`;
  if (blended) return `Today follows ${name} (${counts}), mixed with the baths people play.${download}`;
  return `Today is ${name} — ${counts}.${download}`;
}

async function ensureDaily(sql: Sql) {
  const day = utcDay();
  const id = `daily-${day}`;
  const existing = await sql<{ stamp: string }>`select stamp from templates where id = ${id}`;
  const totals = await sql<{ plays: number | string }>`
    select coalesce(sum(plays), 0) as plays from templates where kind = 'track'
  `;
  const playedTotal = num(totals[0]?.plays);
  const played = playedTotal > 0;
  const leader = await leadingPreset(sql);
  const stamp = leader
    ? `${played ? "played" : "preset"}:${playedTotal}:${leader.id}:${leader.plays}:${leader.saves}:${leader.stemSaves}:${leader.ups}:${leader.downs}`
    : played
      ? `played:${playedTotal}`
      : "house";
  if (existing[0]?.stamp === stamp) return;
  const tracks = played ? await topPlayed(sql) : [];
  const fromPreset = leader ? presetMix(leader.id) : null;
  let mixed: { bowls: CommunityBowl[]; settings: Settings; receiver: Receiver };
  let description: string;
  if (tracks.length && fromPreset && leader) {
    mixed = mixTracks([
      ...tracks,
      {
        id: leader.id,
        plays: leader.score,
        settings: fromPreset.settings,
        receiver: fromPreset.receiver,
        bowls: fromPreset.bowls,
      },
    ]);
    description = describeLeader(leader, true);
  } else if (tracks.length) {
    mixed = mixTracks(tracks);
    description = "Drawn from the baths people play most. The bowls sit where those tracks place them.";
  } else if (fromPreset && leader) {
    mixed = fromPreset;
    description = describeLeader(leader, false);
  } else {
    mixed = houseBath();
    description = "A house bath for today, until shared tracks have been played.";
  }
  await upsertGenerated(sql, {
    id,
    kind: "daily",
    day,
    stamp,
    title: `Daily · ${dayLabel(day)}`,
    description,
    ...mixed,
  });
}

async function ensureLatest(sql: Sql) {
  const rows = await sql<SignalRow>`
    select cell_x, cell_y, glass, freq_bin, plays, selects, places, size_sum, height_sum, sing_sum, gain_sum, n
    from placement_signals
  `;
  const signals = rows.map((row) => ({
    ...row,
    cell_x: num(row.cell_x),
    cell_y: num(row.cell_y),
    freq_bin: num(row.freq_bin),
    plays: num(row.plays),
    selects: num(row.selects),
    places: num(row.places),
    size_sum: num(row.size_sum),
    height_sum: num(row.height_sum),
    sing_sum: num(row.sing_sum),
    gain_sum: num(row.gain_sum),
    n: num(row.n),
  }));
  const stamp = signalStamp(signals);
  const existing = await sql<{ stamp: string }>`select stamp from templates where id = ${LATEST_ID}`;
  if (existing[0]?.stamp === stamp) return;
  const weighted = signalsToWeighted(signals);
  const tracks = weighted.length ? await topPlayed(sql) : [];
  const mixed = weighted.length
    ? {
        bowls: layoutFromWeighted(weighted, 6),
        settings: tracks.length ? averageSettings(tracks.map((track) => ({ settings: track.settings, weight: track.plays }))) : houseBath().settings,
        receiver: tracks.length ? averageReceiver(tracks.map((track) => ({ receiver: track.receiver, weight: track.plays }))) : houseBath().receiver,
      }
    : houseBath();
  await upsertGenerated(sql, {
    id: LATEST_ID,
    kind: "consensus",
    day: null,
    stamp,
    title: "Latest template",
    description: weighted.length
      ? "The bowls people play, select, and place most often — one bath of the busiest spots."
      : "A starting map. It fills in as people play and place bowls.",
    ...mixed,
  });
}

async function readCard(sql: Sql, id: string): Promise<CommunityCard | null> {
  const rows = await sql.query<TemplateRow>(`${CARD_SQL} where t.id = $1`, [id]);
  return rows[0] ? cardFrom(rows[0]) : null;
}

async function noteSignals(
  sql: Sql,
  bowls: CommunityBowl[],
  mode: { plays?: number; places?: number; selects?: number },
  selectedIndex: number | null,
) {
  for (let index = 0; index < bowls.length; index += 1) {
    const bowl = bowls[index];
    const plays = mode.plays && !bowl.muted ? 1 : 0;
    const places = mode.places ? 1 : 0;
    const selects = mode.selects && index === selectedIndex ? 1 : 0;
    if (!plays && !places && !selects) continue;
    const cellX = cellIndex(bowl.x);
    const cellY = cellIndex(bowl.y);
    const bin = freqToBin(bowl.frequency);
    await sql`
      insert into placement_signals (
        cell_x, cell_y, glass, freq_bin, plays, selects, places, size_sum, height_sum, sing_sum, gain_sum, n
      ) values (
        ${cellX}, ${cellY}, ${bowl.glass}, ${bin}, ${plays}, ${selects}, ${places},
        ${bowl.size}, ${bowl.height}, ${bowl.sing}, ${bowl.gain}, ${1}
      )
      on conflict (cell_x, cell_y, glass, freq_bin) do update set
        plays = placement_signals.plays + excluded.plays,
        selects = placement_signals.selects + excluded.selects,
        places = placement_signals.places + excluded.places,
        size_sum = placement_signals.size_sum + excluded.size_sum,
        height_sum = placement_signals.height_sum + excluded.height_sum,
        sing_sum = placement_signals.sing_sum + excluded.sing_sum,
        gain_sum = placement_signals.gain_sum + excluded.gain_sum,
        n = placement_signals.n + 1
    `;
  }
}

async function readProfile(sql: Sql, userId: string): Promise<Profile | null> {
  const rows = await sql<{ username: string; bio: string; website: string }>`
    select username, bio, website from profiles where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return { username: row.username, bio: row.bio ?? "", website: row.website ?? "" };
}

async function writeProfile(
  sql: Sql,
  userId: string,
  input: { username: string; bio: string; website: string },
): Promise<{ error: string } | { profile: Profile }> {
  const username = cleanUsername(input.username);
  if ("error" in username) return username;
  const website = cleanWebsite(input.website);
  if ("error" in website) return website;
  const bio = cleanText(input.bio, 400);
  const taken = await sql<{ user_id: string }>`
    select user_id from profiles where lower(username) = lower(${username.value}) and user_id <> ${userId}
  `;
  if (taken.length) return { error: "That username is taken." };
  await sql`
    insert into profiles (user_id, username, bio, website)
    values (${userId}, ${username.value}, ${bio}, ${website.value})
    on conflict (user_id) do update set
      username = excluded.username,
      bio = excluded.bio,
      website = excluded.website,
      updated_at = now()
  `;
  const { archiveProfile } = await import("@/lib/community/archive.server");
  await archiveProfile({ username: username.value, bio, website: website.value }).catch(() => undefined);
  return { profile: { username: username.value, bio, website: website.value } };
}

async function mirrorTrack(input: {
  author: string;
  slug: string;
  title: string;
  description: string;
  settings: unknown;
  receiver: unknown;
  ears: unknown;
  bowls: unknown;
}): Promise<void> {
  try {
    const { archiveScene } = await import("@/lib/community/archive.server");
    await archiveScene(input);
  } catch {
    // The bath is already in the database. GitHub is the durable copy.
  }
}

export const getShowcase = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  await serialize(async () => {
    await ensureDaily(sql);
    await ensureLatest(sql);
  });
  const daily = await readCard(sql, `daily-${utcDay()}`);
  const latest = await readCard(sql, LATEST_ID);
  return { daily, latest };
});

export const browseTemplates = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as {
      sort?: string;
      excludeId?: string;
      bowls?: unknown;
      settings?: unknown;
      receiver?: unknown;
    };
    const sort = raw.sort === "new" || raw.sort === "similar" ? raw.sort : "played";
    return {
      sort,
      excludeId: cleanId(raw.excludeId),
      bowls: raw.bowls,
      settings: raw.settings,
      receiver: raw.receiver,
    };
  })
  .handler(async ({ data, context }) => {
    const viewerId = context.userId;
    const sql = await getSql();
    await serialize(async () => {
      await ensureDaily(sql);
      await ensureLatest(sql);
    });
    if (data.sort === "similar") {
      const bowls = sanitizeBowls(data.bowls);
      if (!bowls) return [] as CommunityCard[];
      const settings = sanitizeSettings(data.settings);
      const receiver = sanitizeReceiver(data.receiver);
      const query = embedArrangement(bowls, settings, receiver);
      const rows = await sql<TemplateRow & { embedding: unknown }>`
        select t.id, t.user_id, t.title, t.description, t.plays, t.shares, t.kind, t.day,
               t.parent_id, t.stamp, t.embedding, t.created_at::text as created_at, p.username,
               (select count(*) from template_bowls b where b.template_id = t.id) as bowls
        from templates t
        left join profiles p on p.user_id = t.user_id
        order by t.created_at desc
        limit 300
      `;
      const ranked = rankByVector(
        query,
        rows.map((row) => ({ id: row.id, embedding: asVector(row.embedding) })),
        24,
        data.excludeId ?? undefined,
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ranked
        .map((hit) => {
          const row = byId.get(hit.id);
          return row ? cardFrom(row, hit.score, viewerId) : null;
        })
        .filter((row): row is CommunityCard => row !== null);
    }
    const order = data.sort === "new" ? "t.created_at desc" : "t.plays desc, t.created_at desc";
    const rows = await sql.query<TemplateRow>(
      `${CARD_SQL} where t.kind = 'track' order by ${order} limit 40`,
    );
    return rows.map((row) => cardFrom(row, undefined, viewerId));
  });

export const getTemplate = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ data: id }): Promise<CommunityTemplate | null> => {
    if (!id) return null;
    const sql = await getSql();
    const rows = await sql<TemplateRow>`
      select t.id, t.user_id, t.title, t.description, t.settings, t.receiver, t.ears, t.plays, t.shares,
             t.kind, t.day, t.parent_id, t.stamp, t.user_slug, t.slug, t.created_at::text as created_at, p.username
      from templates t
      left join profiles p on p.user_id = t.user_id
      where t.id = ${id}
    `;
    const row = rows[0];
    if (!row) return null;
    const bowls = await readBowls(sql, id);
    if (bowls.length < 3) return null;
    let parentTitle: string | null = null;
    if (row.parent_id) {
      const parents = await sql<{ title: string }>`select title from templates where id = ${row.parent_id}`;
      parentTitle = parents[0]?.title ?? null;
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      plays: num(row.plays),
      shares: num(row.shares),
      kind: kindOf(row.kind),
      day: row.day,
      parentId: row.parent_id,
      parentTitle,
      author: authorOf(row.username, row.kind),
      createdAt: String(row.created_at ?? ""),
      settings: sanitizeSettings(asObject(row.settings)),
      receiver: sanitizeReceiver(asObject(row.receiver)),
      bowls,
      ears: sanitizeEars(row.ears, sanitizeReceiver(asObject(row.receiver))),
      userSlug: row.user_slug,
      slug: row.slug,
    };
  });

export const listComments = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ data: id }): Promise<CommunityComment[]> => {
    if (!id) return [];
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      template_id: string;
      user_id: string;
      body: string;
      created_at: string;
      username: string | null;
    }>`
      select c.id, c.template_id, c.user_id, c.body, c.created_at::text as created_at, p.username
      from comments c
      left join profiles p on p.user_id = c.user_id
      where c.template_id = ${id}
      order by c.created_at asc
      limit 80
    `;
    return rows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      userId: row.user_id,
      author: row.username && !row.username.includes("@") ? row.username : "Listener",
      body: row.body,
      createdAt: String(row.created_at ?? ""),
    }));
  });

export const recordPlay = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ data: id }) => {
    if (!id) return { ok: false as const };
    const sql = await getSql();
    return serialize(async () => {
      const updated = await sql<{ id: string }>`
        update templates set plays = plays + 1 where id = ${id} returning id
      `;
      if (!updated.length) return { ok: false as const };
      const bowls = await readBowls(sql, id);
      await noteSignals(sql, bowls, { plays: 1 }, null);
      return { ok: true as const };
    });
  });

export const recordPresetPlay = createServerFn({ method: "POST" })
  .validator((input: unknown) => knownPresetId(input))
  .handler(async ({ data: id }) => {
    if (!id) return { ok: false as const };
    const sql = await getSql();
    await sql`
      insert into preset_stats (preset_id, plays, saves, stem_saves)
      values (${id}, 1, 0, 0)
      on conflict (preset_id) do update set
        plays = preset_stats.plays + 1,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const recordPresetSave = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { id?: unknown; stems?: unknown };
    return { id: knownPresetId(raw.id), stems: raw.stems === true };
  })
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const };
    const sql = await getSql();
    const stems = data.stems ? 1 : 0;
    await sql`
      insert into preset_stats (preset_id, plays, saves, stem_saves)
      values (${data.id}, 0, 1, ${stems})
      on conflict (preset_id) do update set
        saves = preset_stats.saves + 1,
        stem_saves = preset_stats.stem_saves + ${stems},
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const listPresetStats = createServerFn({ method: "GET" }).handler(async (): Promise<PresetStat[]> => {
  const sql = await getSql();
  await ensurePresetVotes(sql);
  const rows = await sql<{
    preset_id: string;
    plays: number | string;
    saves: number | string;
    stem_saves: number | string;
    ups: number | string;
    downs: number | string;
  }>`
    select preset_id, plays, saves, stem_saves, ups, downs from preset_stats
  `;
  return rows.map((row) => ({
    id: row.preset_id,
    plays: num(row.plays),
    saves: num(row.saves),
    stemSaves: num(row.stem_saves),
    ups: num(row.ups),
    downs: num(row.downs),
  }));
});

export const recordPresetVote = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { id?: unknown; vote?: unknown; previous?: unknown };
    const vote = raw.vote === "up" || raw.vote === "down" ? raw.vote : null;
    const previous = raw.previous === "up" || raw.previous === "down" ? raw.previous : null;
    return { id: knownPresetId(raw.id), vote, previous };
  })
  .handler(async ({ data }) => {
    if (!data.id || !data.vote || data.vote === data.previous) return { ok: false as const };
    const sql = await getSql();
    await ensurePresetVotes(sql);
    const up = (data.vote === "up" ? 1 : 0) - (data.previous === "up" ? 1 : 0);
    const down = (data.vote === "down" ? 1 : 0) - (data.previous === "down" ? 1 : 0);
    await sql`
      insert into preset_stats (preset_id, plays, saves, stem_saves, ups, downs)
      values (${data.id}, 0, 0, 0, ${Math.max(0, up)}, ${Math.max(0, down)})
      on conflict (preset_id) do update set
        ups = greatest(0, preset_stats.ups + ${up}),
        downs = greatest(0, preset_stats.downs + ${down}),
        updated_at = now()
    `;
    return { ok: true as const };
  });

let picksReady = false;

async function ensurePresetPicks(sql: Sql) {
  if (picksReady) return;
  await sql`
    create table if not exists preset_picks (
      id bigserial primary key,
      preset_id text not null default '',
      tag text,
      kind text not null default 'open',
      source text not null default 'house',
      week text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists preset_picks_week on preset_picks (week, preset_id)`;
  await sql`
    create table if not exists preset_weeks (
      week text primary key,
      used_venice boolean not null default false,
      proposal text not null,
      created_at timestamptz not null default now()
    )
  `;
  picksReady = true;
}

export const recordPresetPick = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { id?: unknown; tag?: unknown; kind?: unknown };
    const kind = raw.kind === "open" || raw.kind === "tag" || raw.kind === "up" || raw.kind === "down" ? raw.kind : null;
    const tag = typeof raw.tag === "string" ? raw.tag.trim().slice(0, 48) : "";
    return { id: knownPresetId(raw.id), tag, kind };
  })
  .handler(async ({ data }) => {
    if (!data.kind) return { ok: false as const };
    if (data.kind === "tag" ? !data.tag : !data.id) return { ok: false as const };
    const sql = await getSql();
    await ensurePresetPicks(sql);
    const preset = data.id ? getPreset(data.id) : undefined;
    const source = preset?.source === "ai" ? "ai" : "house";
    await sql`
      insert into preset_picks (preset_id, tag, kind, source, week)
      values (${data.id ?? ""}, ${data.tag || null}, ${data.kind}, ${source}, ${isoWeek()})
    `;
    return { ok: true as const };
  });

function presetLabel(id: string): string {
  return getPreset(id)?.name ?? id;
}

async function weekBrief(sql: Sql, week: string): Promise<string> {
  const picks = await sql<{ preset_id: string; kind: string; n: number | string }>`
    select preset_id, kind, count(*) as n
    from preset_picks
    where week = ${week} and preset_id <> ''
    group by preset_id, kind
    order by count(*) desc
    limit 48
  `;
  const tags = await sql<{ tag: string; n: number | string }>`
    select tag, count(*) as n
    from preset_picks
    where week = ${week} and kind = 'tag' and tag is not null
    group by tag
    order by count(*) desc
    limit 12
  `;
  const loved = await sql<{
    preset_id: string;
    plays: number | string;
    saves: number | string;
    stem_saves: number | string;
    ups: number | string;
    downs: number | string;
  }>`
    select preset_id, plays, saves, stem_saves, ups, downs
    from preset_stats
    order by (plays + saves * 3 + stem_saves * 2 + ups * 4 - downs * 3) desc
    limit 8
  `;
  const byKind = new Map<string, string[]>();
  for (const row of picks) {
    const line = `${presetLabel(row.preset_id)} ${num(row.n)}`;
    const list = byKind.get(row.kind) ?? [];
    list.push(line);
    byKind.set(row.kind, list);
  }
  const lines = [
    `Opens: ${(byKind.get("open") ?? []).slice(0, 8).join(", ") || "none"}`,
    `Thumbs up: ${(byKind.get("up") ?? []).slice(0, 8).join(", ") || "none"}`,
    `Thumbs down: ${(byKind.get("down") ?? []).slice(0, 8).join(", ") || "none"}`,
    `Tags: ${tags.map((row) => `${row.tag} ${num(row.n)}`).join(", ") || "none"}`,
    `Loved so far: ${
      loved
        .map((row) => {
          const score = presetScore(num(row.plays), num(row.saves), num(row.stem_saves), num(row.ups), num(row.downs));
          return `${presetLabel(row.preset_id)} ${score}`;
        })
        .join(", ") || "none"
    }`,
    `Catalog: ${PRESETS.length} presets, ${PRESETS.filter((preset) => preset.source === "ai").length} already marked AI generated.`,
  ];
  return lines.join("\n");
}

function localWeekNote(week: string, brief: string): string {
  return `${week}\n${brief}\n\nVenice is not connected yet, so this is the usage brief the next AI generated set will be written from.`;
}

function veniceNote(week: string, brief: string, reason: "balance" | "failed"): string {
  const why =
    reason === "balance"
      ? "Venice accepted the key, but this account has no balance left. Add credits at https://venice.ai/settings/api and draft the week again."
      : "Venice did not answer this time. Draft the week again in a moment.";
  return `${week}\n${brief}\n\n${why}`;
}

/** One weekly brief. Venice runs once per week when the call succeeds. */
export const proposeWeeklyPresets = createServerFn({ method: "POST" }).handler(async () => {
  const sql = await getSql();
  const week = isoWeek();
  await ensurePresetPicks(sql);
  await ensurePresetVotes(sql);
  const existing = await sql<{ used_venice: boolean; proposal: string }>`
    select used_venice, proposal from preset_weeks where week = ${week}
  `;
  const row = existing[0];
  if (row?.used_venice && row.proposal) {
    return { week, usedVenice: true as const, proposal: row.proposal };
  }
  const brief = await weekBrief(sql, week);
  const { askVenice } = await import("@/lib/community/venice.server");
  const answer = await askVenice(`${week}\n${brief}`);
  let proposal = localWeekNote(week, brief);
  let usedVenice = false;
  if (answer.ok) {
    proposal = `${week}\n${answer.text}`;
    usedVenice = true;
  } else if (answer.reason !== "missing") {
    proposal = veniceNote(week, brief, answer.reason);
  }
  await sql`
    insert into preset_weeks (week, used_venice, proposal)
    values (${week}, ${usedVenice}, ${proposal})
    on conflict (week) do update set
      used_venice = preset_weeks.used_venice or excluded.used_venice,
      proposal = case when preset_weeks.used_venice then preset_weeks.proposal else excluded.proposal end
  `;
  const { archiveWeek } = await import("@/lib/community/archive.server");
  await archiveWeek(week, proposal, usedVenice).catch(() => undefined);
  return { week, usedVenice, proposal };
});

export const recordShare = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ data: id }) => {
    if (!id) return { ok: false as const, shares: 0 };
    const sql = await getSql();
    const rows = await sql<{ shares: number | string }>`
      update templates set shares = shares + 1 where id = ${id} returning shares
    `;
    if (!rows.length) return { ok: false as const, shares: 0 };
    return { ok: true as const, shares: num(rows[0].shares) };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await readProfile(sql, context.userId);
    return { profile };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as Partial<Profile>;
    return {
      username: typeof raw.username === "string" ? raw.username : "",
      bio: typeof raw.bio === "string" ? raw.bio : "",
      website: typeof raw.website === "string" ? raw.website : "",
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return writeProfile(sql, context.userId, data);
  });

export const publishTemplate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    return raw;
  })
  .handler(async ({ context, data }) => {
    const title = cleanText(data.title, 80);
    if ([...title].length < 1) return { error: "Give the bath a title." };
    const description = cleanText(data.description, 500);
    const bowls = sanitizeBowls(data.bowls);
    if (!bowls) return { error: "A shared bath needs at least three bowls." };
    const settings = sanitizeSettings({
      ...(data.settings && typeof data.settings === "object" ? data.settings : {}),
      gongs: bowls.map((bowl) => bowl.gong ?? null),
    });
    const receiver = sanitizeReceiver(data.receiver);
    const sql = await getSql();
    return serialize(async () => {
      if (typeof data.username === "string" && data.username.trim()) {
        const saved = await writeProfile(sql, context.userId, {
          username: data.username,
          bio: typeof data.bio === "string" ? data.bio : "",
          website: typeof data.website === "string" ? data.website : "",
        });
        if ("error" in saved) return saved;
      }
      const profile = await readProfile(sql, context.userId);
      if (!profile) return { error: "Pick a username before sharing." };
      const userSlug = slugify(profile.username) || "listener";
      const ears = sanitizeEars(data.ears, receiver);
      const embedding = JSON.stringify(embedArrangement(bowls, settings, receiver));
      const earsJson = JSON.stringify(ears);
      const updateId = cleanId(data.id);
      if (updateId) {
        const owned = await sql<{ id: string; user_slug: string | null; slug: string | null }>`
          select id, user_slug, slug from templates
          where id = ${updateId} and user_id = ${context.userId} and kind = 'track'
        `;
        const current = owned[0];
        if (current) {
          const nextSlug = current.slug || (await freeSlug(sql, userSlug, slugify(title) || "bath"));
          const nextUser = current.user_slug || userSlug;
          await sql`
            update templates set
              title = ${title},
              description = ${description},
              settings = ${JSON.stringify(settings)}::jsonb,
              receiver = ${JSON.stringify(receiver)}::jsonb,
              ears = ${earsJson}::jsonb,
              embedding = ${embedding}::jsonb,
              user_slug = ${nextUser},
              slug = ${nextSlug},
              updated_at = now()
            where id = ${current.id}
          `;
          await writeBowls(sql, current.id, bowls);
          await mirrorTrack({
            author: nextUser,
            slug: nextSlug,
            title,
            description,
            settings,
            receiver,
            ears,
            bowls,
          });
          const card = await readCard(sql, current.id);
          return { template: card, id: current.id, userSlug: nextUser, slug: nextSlug, path: sharePath(nextUser, nextSlug) };
        }
      }
      let parentId = cleanId(data.parentId);
      if (parentId) {
        const parent = await sql<{ id: string }>`select id from templates where id = ${parentId}`;
        if (!parent.length) parentId = null;
      }
      const id = crypto.randomUUID();
      const slug = await freeSlug(sql, userSlug, slugify(title) || "bath");
      await sql`
        insert into templates (
          id, user_id, title, description, settings, receiver, embedding, kind, parent_id, user_slug, slug, ears
        ) values (
          ${id}, ${context.userId}, ${title}, ${description},
          ${JSON.stringify(settings)}::jsonb, ${JSON.stringify(receiver)}::jsonb, ${embedding}::jsonb,
          ${"track"}, ${parentId}, ${userSlug}, ${slug}, ${earsJson}::jsonb
        )
      `;
      await writeBowls(sql, id, bowls);
      await mirrorTrack({ author: userSlug, slug, title, description, settings, receiver, ears, bowls });
      const selected = num(data.selectedIndex, -1);
      await noteSignals(sql, bowls, { places: 1, selects: 1 }, selected >= 0 ? selected : null);
      const card = await readCard(sql, id);
      return { template: card, id, userSlug, slug, path: sharePath(userSlug, slug) };
    });
  });

export const updateTemplateText = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { id?: unknown; title?: unknown; description?: unknown };
    return {
      id: cleanId(raw.id),
      title: typeof raw.title === "string" ? raw.title : "",
      description: typeof raw.description === "string" ? raw.description : "",
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) return { error: "That bath is missing." };
    const title = cleanText(data.title, 80);
    if ([...title].length < 1) return { error: "Give the bath a title." };
    const description = cleanText(data.description, 500);
    const sql = await getSql();
    const updated = await sql<{ id: string }>`
      update templates set title = ${title}, description = ${description}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId} and kind = 'track'
      returning id
    `;
    if (!updated.length) return { error: "You can only rename a bath you saved." };
    const rows = await sql<{
      title: string;
      description: string;
      settings: unknown;
      receiver: unknown;
      ears: unknown;
      user_slug: string | null;
      slug: string | null;
    }>`
      select title, description, settings, receiver, ears, user_slug, slug
      from templates where id = ${data.id}
    `;
    const row = rows[0];
    if (row?.user_slug && row.slug) {
      await mirrorTrack({
        author: row.user_slug,
        slug: row.slug,
        title: row.title,
        description: row.description,
        settings: row.settings,
        receiver: row.receiver,
        ears: row.ears,
        bowls: await readBowls(sql, data.id),
      });
    }
    const card = await readCard(sql, data.id);
    return { template: card };
  });

async function freeSlug(sql: Sql, userSlug: string, base: string): Promise<string> {
  let slug = base || "bath";
  for (let n = 2; n < 40; n++) {
    const rows = await sql<{ id: string }>`select id from templates where user_slug = ${userSlug} and slug = ${slug}`;
    if (!rows.length) return slug;
    slug = `${base}-${n}`.slice(0, 48);
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export const getShare = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { user?: unknown; slug?: unknown };
    return {
      user: typeof raw.user === "string" ? raw.user : "",
      slug: typeof raw.slug === "string" ? raw.slug : "",
    };
  })
  .handler(async ({ data }): Promise<{ view: ShareView | null; origin: string }> => {
    const view = await loadShare(data.user, data.slug);
    let origin = "";
    try {
      origin = new URL(getRequest().url).origin;
    } catch {
      origin = "";
    }
    return { view, origin };
  });

export const removeTemplate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ context, data: id }) => {
    if (!id) return { ok: false as const };
    const sql = await getSql();
    const rows = await sql<{ user_slug: string | null; slug: string | null }>`
      delete from templates where id = ${id} and user_id = ${context.userId} and kind = 'track'
      returning user_slug, slug
    `;
    const removed = rows[0];
    if (removed?.user_slug && removed.slug) {
      try {
        const { removeArchivedScene } = await import("@/lib/community/archive.server");
        await removeArchivedScene(removed.user_slug, removed.slug);
      } catch {
        // The database row is already gone.
      }
    }
    return { ok: rows.length > 0 };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input && typeof input === "object" ? input : {}) as { templateId?: unknown; body?: unknown };
    return { templateId: raw.templateId, body: raw.body };
  })
  .handler(async ({ context, data }) => {
    const templateId = cleanId(data.templateId);
    const body = cleanText(data.body, 400);
    if (!templateId) return { error: "That bath is missing." };
    if ([...body].length < 1) return { error: "Write a comment first." };
    const sql = await getSql();
    const profile = await readProfile(sql, context.userId);
    if (!profile) return { error: "Pick a username before commenting." };
    const found = await sql<{ id: string }>`select id from templates where id = ${templateId}`;
    if (!found.length) return { error: "That bath is gone." };
    const id = crypto.randomUUID();
    await sql`
      insert into comments (id, template_id, user_id, body) values (${id}, ${templateId}, ${context.userId}, ${body})
    `;
    const comment: CommunityComment = {
      id,
      templateId,
      userId: context.userId,
      author: profile.username,
      body,
      createdAt: new Date().toISOString(),
    };
    return { comment };
  });

export const removeComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => cleanId(input))
  .handler(async ({ context, data: id }) => {
    if (!id) return { ok: false as const };
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      delete from comments where id = ${id} and user_id = ${context.userId} returning id
    `;
    return { ok: rows.length > 0 };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DashboardData> => {
    const sql = await getSql();
    await serialize(async () => {
      await ensureDaily(sql);
      await ensureLatest(sql);
    });
    const profile = await readProfile(sql, context.userId);
    const totals = await sql<{ tracks: number | string; plays: number | string; shares: number | string }>`
      select count(*) as tracks, coalesce(sum(plays), 0) as plays, coalesce(sum(shares), 0) as shares
      from templates
      where user_id = ${context.userId} and kind = 'track'
    `;
    const templates = await sql.query<TemplateRow>(
      `${CARD_SQL} where t.user_id = $1 and t.kind = 'track' order by t.created_at desc limit 60`,
      [context.userId],
    );
    return {
      profile,
      stats: {
        tracks: num(totals[0]?.tracks),
        plays: num(totals[0]?.plays),
        shares: num(totals[0]?.shares),
      },
      templates: templates.map((row) => cardFrom(row)),
      daily: await readCard(sql, `daily-${utcDay()}`),
      latest: await readCard(sql, LATEST_ID),
    };
  });
