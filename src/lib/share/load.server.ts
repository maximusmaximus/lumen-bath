import { getSql } from "@/lib/db";
import { DEFAULT_SETTINGS, getPreset, instantiatePreset } from "@/lib/audio/presets";
import { makeEar } from "@/lib/audio/space";
import type { Ear, EarSide, Receiver } from "@/lib/audio/types";
import { MAX_EARS } from "@/lib/audio/types";
import { sanitizeBowls, sanitizeReceiver, sanitizeSettings } from "@/lib/community/embed";
import type { CommunityBowl } from "@/lib/community/types";
import { HOUSE_SLUG, slugify } from "@/lib/share/slug";

import type { ShareView } from "@/lib/share/types";

function side(raw: unknown): Partial<EarSide> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as Partial<EarSide>;
}

export function sanitizeEars(input: unknown, receiver: Receiver): Ear[] {
  let list: unknown = input;
  if (typeof input === "string") {
    try {
      list = JSON.parse(input) as unknown;
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list) || list.length === 0) return [makeEar(receiver, "ear-1")];
  const ears: Ear[] = [];
  for (const item of list.slice(0, MAX_EARS)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { left?: unknown; right?: unknown };
    const pose = sanitizeReceiver(item);
    ears.push(makeEar(pose, `ear-${ears.length + 1}`, side(raw.left), side(raw.right)));
  }
  return ears.length ? ears : [makeEar(receiver, "ear-1")];
}

function bowlsOf(made: ReturnType<typeof instantiatePreset>): CommunityBowl[] {
  return made.bowls.map((bowl) => ({
    frequency: bowl.frequency,
    size: bowl.size,
    height: bowl.height,
    glass: bowl.glass,
    gain: bowl.gain,
    x: bowl.x,
    y: bowl.y,
    sing: bowl.sing,
    muted: false,
  }));
}

function presetView(id: string): ShareView | null {
  const preset = getPreset(id);
  if (!preset) return null;
  const made = instantiatePreset(preset.id);
  const ears = made.ears.length ? made.ears : [makeEar(sanitizeReceiver(preset.receiver ?? {}), "ear-1")];
  return {
    kind: "preset",
    id: null,
    userSlug: HOUSE_SLUG,
    slug: preset.id,
    title: preset.name,
    description: preset.blurb,
    author: "Lumen",
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...made.settingsPatch }),
    receiver: sanitizeReceiver(ears[0]),
    bowls: bowlsOf(made),
    ears,
    presetId: preset.id,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export async function loadShare(userRaw: string, slugRaw: string): Promise<ShareView | null> {
  const user = slugify(userRaw);
  const slug = slugify(slugRaw);
  if (!user || !slug) return null;
  if (user === HOUSE_SLUG) {
    const preset = presetView(slug);
    if (preset) return preset;
  }
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    title: string;
    description: string;
    settings: unknown;
    receiver: unknown;
    ears: unknown;
    username: string | null;
  }>`
    select t.id, t.title, t.description, t.settings, t.receiver, t.ears, p.username
    from templates t
    left join profiles p on p.user_id = t.user_id
    where t.user_slug = ${user} and t.slug = ${slug}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const settings = sanitizeSettings(asObject(row.settings));
  const receiver = sanitizeReceiver(asObject(row.receiver));
  const bowls = sanitizeBowls(await bowlsFor(row.id));
  if (!bowls) return null;
  return {
    kind: "track",
    id: row.id,
    userSlug: user,
    slug,
    title: row.title,
    description: row.description,
    author: row.username ?? "Listener",
    settings,
    receiver,
    bowls,
    ears: sanitizeEars(row.ears, receiver),
    presetId: null,
  };
}

async function bowlsFor(id: string): Promise<unknown> {
  const sql = await getSql();
  return sql`
    select frequency, size, height, glass, gain, x, y, sing, muted
    from template_bowls
    where template_id = ${id}
    order by bowl_index asc
  `;
}
