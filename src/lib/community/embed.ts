import { clampDome } from "@/lib/audio/dome";
import { GLASS_IDS } from "@/lib/audio/glass";
import { isGong } from "@/lib/audio/gong";
import { periodRange } from "@/lib/audio/notes";
import { DEFAULT_PRESET_ID, DEFAULT_SETTINGS, instantiatePreset } from "@/lib/audio/presets";
import { getRoom } from "@/lib/audio/rooms";
import { DEFAULT_RECEIVER, EAR_HEIGHT_MAX, earPitch } from "@/lib/audio/space";
import type { CommunityBowl } from "@/lib/community/types";
import {
  MAX_BOWLS,
  MAX_HZ,
  MIN_BOWLS,
  MIN_HZ,
  type GlassId,
  type LoopMode,
  type OutputMode,
  type Receiver,
  type RoomShapeId,
  type SceneUse,
  type SceneView,
  type Settings,
} from "@/lib/audio/types";

const SIGNAL_BINS = 12;
const CELLS = 8;
const LOOPS = new Set<LoopMode>(["continuous", "breath", "tide", "mallet", "canon"]);
const OUTPUTS = new Set<OutputMode>(["session", "direct"]);
const GLASS_SET = new Set<string>(GLASS_IDS);

export type WeightedBowl = CommunityBowl & { weight: number };

export type SignalRow = {
  cell_x: number;
  cell_y: number;
  glass: string;
  freq_bin: number;
  plays: number;
  selects: number;
  places: number;
  size_sum: number;
  height_sum: number;
  sing_sum: number;
  gain_sum: number;
  n: number;
};

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unit(value: unknown, fallback: number): number {
  return clamp(num(value, fallback), 0, 1);
}

export function isGlass(value: string): value is GlassId {
  return GLASS_SET.has(value);
}

export function cellIndex(value: number): number {
  const t = clamp(value, 0, 0.999);
  return Math.min(CELLS - 1, Math.floor(t * CELLS));
}

export function cellCenter(cell: number): number {
  return (clamp(cell, 0, CELLS - 1) + 0.5) / CELLS;
}

export function freqToBin(hz: number): number {
  const min = Math.log(MIN_HZ);
  const max = Math.log(MAX_HZ);
  const clamped = clamp(hz, MIN_HZ, MAX_HZ);
  const t = (Math.log(clamped) - min) / (max - min);
  return Math.min(SIGNAL_BINS - 1, Math.max(0, Math.floor(t * SIGNAL_BINS)));
}

export function binToHz(bin: number): number {
  const min = Math.log(MIN_HZ);
  const max = Math.log(MAX_HZ);
  const t = (Math.min(SIGNAL_BINS - 1, Math.max(0, bin)) + 0.5) / SIGNAL_BINS;
  return Math.round(Math.exp(min + t * (max - min)) * 100) / 100;
}

export function sanitizeReceiver(input: unknown): Receiver {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<Receiver>;
  return {
    x: clamp(num(raw.x, DEFAULT_RECEIVER.x), 0.04, 0.96),
    y: clamp(num(raw.y, DEFAULT_RECEIVER.y), 0.04, 0.96),
    height: clamp(num(raw.height, DEFAULT_RECEIVER.height), 0, EAR_HEIGHT_MAX),
    yaw: Number.isFinite(raw.yaw) ? Math.atan2(Math.sin(raw.yaw as number), Math.cos(raw.yaw as number)) : 0,
    pitch: earPitch(raw),
  };
}

function sceneView(input: unknown): SceneView | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<SceneView>;
  const nums = [raw.x, raw.y, raw.z, raw.tx, raw.ty, raw.tz].map((value) => Number(value));
  if (nums.some((value) => !Number.isFinite(value) || Math.abs(value) > 400)) return undefined;
  const [x, y, z, tx, ty, tz] = nums as [number, number, number, number, number, number];
  return { x, y, z, tx, ty, tz };
}

function sceneUse(input: unknown): SceneUse | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<SceneUse>;
  const seconds = Number(raw.cycleSeconds);
  return {
    playing: Boolean(raw.playing),
    waves: Boolean(raw.waves),
    cycle: Boolean(raw.cycle),
    cycleSeconds: Math.min(33.33, Math.max(0.25, Number.isFinite(seconds) ? seconds : 0.25)),
  };
}

function sceneDomes(input: unknown): Settings["domes"] {
  if (!Array.isArray(input)) return undefined;
  const list = input
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const raw = item as { id?: string };
      const id = typeof raw.id === "string" && raw.id ? raw.id : `shared-dome-${index + 1}`;
      return clampDome({ ...raw, id } as Parameters<typeof clampDome>[0]);
    })
    .slice(0, 4);
  return list.length ? list : undefined;
}

function scenePoster(input: unknown): string | undefined {
  if (typeof input !== "string" || !input.startsWith("data:image/jpeg;base64,")) return undefined;
  if (input.length > 480000) return undefined;
  return input;
}

export function sanitizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const loopMode = LOOPS.has(raw.loopMode as LoopMode) ? (raw.loopMode as LoopMode) : "continuous";
  const range = periodRange(loopMode);
  let period = num(raw.period, DEFAULT_SETTINGS.period);
  if (range) period = clamp(period, range[0], range[1]);
  const room = getRoom(typeof raw.roomShape === "string" ? raw.roomShape : DEFAULT_SETTINGS.roomShape);
  const shape = room.id as RoomShapeId;
  return {
    loopMode,
    period,
    veil: unit(raw.veil, DEFAULT_SETTINGS.veil),
    veilHz: clamp(num(raw.veilHz, DEFAULT_SETTINGS.veilHz), 0.05, 3),
    shimmer: unit(raw.shimmer, DEFAULT_SETTINGS.shimmer),
    width: unit(raw.width, DEFAULT_SETTINGS.width),
    depth: unit(raw.depth, DEFAULT_SETTINGS.depth),
    binaural: Boolean(raw.binaural),
    binauralCarrier: clamp(num(raw.binauralCarrier, DEFAULT_SETTINGS.binauralCarrier), 40, 400),
    binauralBeat: clamp(num(raw.binauralBeat, DEFAULT_SETTINGS.binauralBeat), 0.1, 20),
    binauralLevel: unit(raw.binauralLevel, DEFAULT_SETTINGS.binauralLevel),
    wet: unit(raw.wet, DEFAULT_SETTINGS.wet),
    hall: unit(raw.hall, DEFAULT_SETTINGS.hall),
    air: unit(raw.air, DEFAULT_SETTINGS.air),
    transpose: clamp(num(raw.transpose, DEFAULT_SETTINGS.transpose), -1200, 1200),
    roomShape: shape,
    size: clamp(num(raw.size, DEFAULT_SETTINGS.size), 1, 8),
    decay: unit(raw.decay, room.decay),
    early: unit(raw.early, room.early),
    diffusion: unit(raw.diffusion, room.diffusion),
    absorption: unit(raw.absorption, room.absorption),
    flutter: unit(raw.flutter, room.flutter),
    modes: unit(raw.modes, room.modes),
    airLoss: unit(raw.airLoss, room.airLoss),
    slap: unit(raw.slap, room.slap),
    bloom: unit(raw.bloom, room.bloom),
    space: unit(raw.space, room.space),
    volume: unit(raw.volume, DEFAULT_SETTINGS.volume),
    awake: Boolean(raw.awake),
    output: OUTPUTS.has(raw.output as OutputMode) ? (raw.output as OutputMode) : DEFAULT_SETTINGS.output,
    gongs: Array.isArray(raw.gongs) ? raw.gongs.map((item) => (isGong(item) ? item : null)).slice(0, 20) : undefined,
    ...(Number.isFinite(raw.layoutSpanX) ? { layoutSpanX: Math.min(80, Math.max(1, Number(raw.layoutSpanX))) } : {}),
    ...(Number.isFinite(raw.layoutSpanZ) ? { layoutSpanZ: Math.min(80, Math.max(1, Number(raw.layoutSpanZ))) } : {}),
    ...(sceneView(raw.view) ? { view: sceneView(raw.view) } : {}),
    ...(sceneUse(raw.use) ? { use: sceneUse(raw.use) } : {}),
    ...(sceneDomes(raw.domes) ? { domes: sceneDomes(raw.domes) } : {}),
    ...(scenePoster(raw.poster) ? { poster: scenePoster(raw.poster) } : {}),
  };
}

export function sanitizeBowls(input: unknown): CommunityBowl[] | null {
  if (!Array.isArray(input)) return null;
  const bowls: CommunityBowl[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<CommunityBowl>;
    const glass = String(raw.glass ?? "");
    if (!isGlass(glass)) continue;
    bowls.push({
      frequency: clamp(num(raw.frequency, 220), MIN_HZ, MAX_HZ),
      size: clamp(num(raw.size, 0.6), 0.36, 1),
      height: clamp(num(raw.height, 0.5), 0.22, 1),
      glass,
      gain: clamp(num(raw.gain, 0.7), 0.05, 1),
      x: clamp(num(raw.x, 0.5), 0.04, 0.96),
      y: clamp(num(raw.y, 0.5), 0.04, 0.96),
      sing: clamp(num(raw.sing, 0.2), 0, 1),
      muted: Boolean(raw.muted),
      ...(isGong(raw.gong) ? { gong: raw.gong } : {}),
    });
    if (bowls.length >= MAX_BOWLS) break;
  }
  return bowls.length >= MIN_BOWLS ? bowls : null;
}

export function houseBath(): { bowls: CommunityBowl[]; settings: Settings; receiver: Receiver } {
  const made = instantiatePreset(DEFAULT_PRESET_ID);
  const ear = made.ears[0];
  return {
    bowls:
      sanitizeBowls(
        made.bowls.map((bowl) => ({
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
      ) ?? [],
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...made.settingsPatch }),
    receiver: sanitizeReceiver(ear ?? DEFAULT_RECEIVER),
  };
}

export function embedArrangement(bowls: CommunityBowl[], settings: Settings, receiver: Receiver): number[] {
  const vector: number[] = [];
  const glassAt = new Map(GLASS_IDS.map((id, index) => [id, index]));
  for (let index = 0; index < 8; index += 1) {
    const bowl = bowls[index];
    if (!bowl || bowl.muted) {
      vector.push(0, 0, 0, 0, 0, 0, 0, 0);
      continue;
    }
    vector.push(
      bowl.x,
      bowl.y,
      bowl.size,
      bowl.height,
      bowl.gain,
      bowl.sing,
      freqToBin(bowl.frequency) / (SIGNAL_BINS - 1),
      (glassAt.get(bowl.glass) ?? 0) / Math.max(1, GLASS_IDS.length - 1),
    );
  }
  vector.push(
    receiver.x,
    receiver.y,
    clamp(receiver.height, 0, EAR_HEIGHT_MAX) / EAR_HEIGHT_MAX,
    earPitch(receiver),
    settings.wet,
    settings.hall,
    settings.decay,
    settings.shimmer,
    settings.size / 8,
  );
  return vector;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    aa += left * left;
    bb += right * right;
  }
  if (aa <= 1e-8 || bb <= 1e-8) return 0;
  return dot / Math.sqrt(aa * bb);
}

export function rankByVector(
  query: number[],
  rows: { id: string; embedding: number[] }[],
  limit: number,
  excludeId?: string,
): { id: string; score: number }[] {
  return rows
    .filter((row) => row.id !== excludeId && row.embedding.length > 0)
    .map((row) => ({ id: row.id, score: cosine(query, row.embedding) }))
    .filter((row) => row.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function layoutFromWeighted(items: WeightedBowl[], want = 6): CommunityBowl[] {
  const ranked = [...items].filter((item) => item.weight > 0 && !item.muted).sort((a, b) => b.weight - a.weight);
  const picked: WeightedBowl[] = [];
  for (const item of ranked) {
    const crowded = picked.some((other) => Math.hypot(other.x - item.x, other.y - item.y) < 0.12);
    if (crowded) continue;
    picked.push(item);
    if (picked.length >= want) break;
  }
  const bowls = picked.map(({ weight: _weight, ...bowl }) => bowl);
  return sanitizeBowls(bowls) ?? houseBath().bowls.slice(0, want);
}

export function signalsToWeighted(rows: SignalRow[]): WeightedBowl[] {
  const weighted: WeightedBowl[] = [];
  for (const row of rows) {
    if (!isGlass(row.glass) || row.n <= 0) continue;
    const weight = row.plays + row.selects * 2 + row.places * 3;
    if (weight <= 0) continue;
    const n = Math.max(1, row.n);
    weighted.push({
      frequency: binToHz(row.freq_bin),
      size: row.size_sum / n,
      height: row.height_sum / n,
      glass: row.glass,
      gain: row.gain_sum / n,
      x: cellCenter(row.cell_x),
      y: cellCenter(row.cell_y),
      sing: row.sing_sum / n,
      muted: false,
      weight,
    });
  }
  return weighted;
}

export function signalStamp(rows: { plays: number; selects: number; places: number }[]): string {
  let plays = 0;
  let selects = 0;
  let places = 0;
  for (const row of rows) {
    plays += row.plays;
    selects += row.selects;
    places += row.places;
  }
  return `${rows.length}:${plays}:${selects}:${places}`;
}

export function averageReceiver(items: { receiver: Receiver; weight: number }[]): Receiver {
  let weight = 0;
  let x = 0;
  let y = 0;
  let height = 0;
  let yawX = 0;
  let yawY = 0;
  let pitch = 0;
  for (const item of items) {
    if (!(item.weight > 0)) continue;
    weight += item.weight;
    x += item.receiver.x * item.weight;
    y += item.receiver.y * item.weight;
    height += item.receiver.height * item.weight;
    yawX += Math.cos(item.receiver.yaw) * item.weight;
    yawY += Math.sin(item.receiver.yaw) * item.weight;
    pitch += earPitch(item.receiver) * item.weight;
  }
  if (weight <= 0) return { ...DEFAULT_RECEIVER };
  return sanitizeReceiver({
    x: x / weight,
    y: y / weight,
    height: height / weight,
    yaw: Math.atan2(yawY, yawX),
    pitch: pitch / weight,
  });
}

export function averageSettings(items: { settings: Settings; weight: number }[]): Settings {
  if (!items.length) return sanitizeSettings(DEFAULT_SETTINGS);
  const modes = new Map<LoopMode, number>();
  const shapes = new Map<RoomShapeId, number>();
  let weight = 0;
  const acc = { ...DEFAULT_SETTINGS };
  const keys = [
    "period",
    "veil",
    "veilHz",
    "shimmer",
    "width",
    "depth",
    "binauralCarrier",
    "binauralBeat",
    "binauralLevel",
    "wet",
    "hall",
    "air",
    "transpose",
    "size",
    "decay",
    "early",
    "diffusion",
    "absorption",
    "flutter",
    "modes",
    "airLoss",
    "slap",
    "bloom",
    "space",
    "volume",
  ] as const;
  const sums = Object.fromEntries(keys.map((key) => [key, 0])) as Record<(typeof keys)[number], number>;
  for (const item of items) {
    if (!(item.weight > 0)) continue;
    weight += item.weight;
    modes.set(item.settings.loopMode, (modes.get(item.settings.loopMode) ?? 0) + item.weight);
    shapes.set(item.settings.roomShape, (shapes.get(item.settings.roomShape) ?? 0) + item.weight);
    for (const key of keys) sums[key] += item.settings[key] * item.weight;
  }
  if (weight <= 0) return sanitizeSettings(DEFAULT_SETTINGS);
  let loopMode: LoopMode = "continuous";
  let loopWeight = -1;
  for (const [mode, value] of modes) {
    if (value > loopWeight) {
      loopMode = mode;
      loopWeight = value;
    }
  }
  let roomShape: RoomShapeId = DEFAULT_SETTINGS.roomShape;
  let shapeWeight = -1;
  for (const [shape, value] of shapes) {
    if (value > shapeWeight) {
      roomShape = shape;
      shapeWeight = value;
    }
  }
  for (const key of keys) acc[key] = sums[key] / weight;
  return sanitizeSettings({ ...acc, loopMode, roomShape });
}
