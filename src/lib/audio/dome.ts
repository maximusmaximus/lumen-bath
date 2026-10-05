import { clampHz } from "@/lib/audio/notes";
import { roomPatch } from "@/lib/audio/rooms";
import { EAR_HIGH, EAR_LOW, roomSpread, type CeilingBounce } from "@/lib/audio/space";
import type { Dome, GlassId } from "@/lib/audio/types";

type SpreadSettings = Parameters<typeof roomSpread>[0];

export const DOME_SIZE_MIN = 0.28;
/** Opening diameter at full scale: the floor of the classic hall at its usual size. */
export const HALL_DIAMETER = (() => {
  const floor = roomSpread({ ...roomPatch("shoebox"), size: 4 });
  return Math.min(floor.x, floor.z);
})();
const HALL_RADIUS = HALL_DIAMETER / 2;
export const DOME_SIZE_MAX = Math.max(1, (HALL_RADIUS - 0.55) / 1.85);
export const DOME_HEIGHT_MIN = 0.55;
export const DOME_HEIGHT_MAX = 3.2;

/** How a shell's material colors the sound that comes back down. */
const GLASS_COAT: Record<GlassId, { gain: number; air: number; body: number }> = {
  quartz: { gain: 1.08, air: 1.22, body: 0.15 },
  frosted: { gain: 0.9, air: 0.78, body: 0.7 },
  gold: { gain: 1, air: 0.7, body: 0.32 },
  platinum: { gain: 1.06, air: 1.28, body: 0.12 },
  rose: { gain: 0.98, air: 0.76, body: 0.36 },
  obsidian: { gain: 1.14, air: 0.48, body: 0.22 },
  aqua: { gain: 0.88, air: 1.32, body: 0.48 },
  emerald: { gain: 0.96, air: 0.84, body: 0.3 },
  phantom: { gain: 0.86, air: 0.92, body: 0.74 },
  selenite: { gain: 1.04, air: 1.08, body: 0.2 },
};

function unit(value: number, fallback: number): number {
  const next = Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, next));
}

export function clampDome(dome: Dome): Dome {
  return {
    ...dome,
    x: Math.min(0.92, Math.max(0.08, dome.x)),
    y: Math.min(0.92, Math.max(0.08, dome.y)),
    size: Math.min(DOME_SIZE_MAX, Math.max(DOME_SIZE_MIN, dome.size)),
    height: Math.min(DOME_HEIGHT_MAX, Math.max(DOME_HEIGHT_MIN, dome.height)),
    frequency: clampHz(dome.frequency),
    reflect: unit(dome.reflect, 0.72),
    diffuse: unit(dome.diffuse, 0.22),
    brightness: unit(dome.brightness, 0.74),
  };
}

export function freshDome(partial: Partial<Dome> = {}): Dome {
  return clampDome({
    id: partial.id ?? "dome",
    x: partial.x ?? 0.5,
    y: partial.y ?? 0.46,
    size: partial.size ?? 0.62,
    height: partial.height ?? 1.35,
    glass: (partial.glass ?? "gold") as GlassId,
    frequency: partial.frequency ?? 196,
    reflect: partial.reflect ?? 0.78,
    diffuse: partial.diffuse ?? 0.22,
    brightness: partial.brightness ?? 0.74,
  });
}

/** Rim of the downward face, in room meters. The shell rises above this. */
export function domePoint(dome: Pick<Dome, "x" | "y" | "size" | "height">, settings: SpreadSettings) {
  const spread = roomSpread(settings);
  const radius = 0.55 + dome.size * 1.85;
  const y = EAR_LOW + Math.min(DOME_HEIGHT_MAX, Math.max(DOME_HEIGHT_MIN, dome.height)) * (EAR_HIGH - EAR_LOW) * 0.72;
  return {
    x: (dome.x - 0.5) * spread.x,
    z: (dome.y - 0.5) * spread.z,
    y,
    radius,
  };
}

/** Footprint of the opening in the same 0–1 floor units as the bowls. */
export function domeCover(dome: Pick<Dome, "x" | "y" | "size" | "height">, settings: SpreadSettings): number {
  const at = domePoint(dome, settings);
  const spread = roomSpread(settings);
  return (at.radius * 2) / Math.max(1, spread.x + spread.z);
}

export function domeCeilings(
  source: { x: number; y: number; z: number },
  frequency: number,
  domes: readonly Dome[],
  settings: SpreadSettings,
): CeilingBounce[] {
  const out: CeilingBounce[] = [];
  for (const dome of domes) {
    const at = domePoint(dome, settings);
    const rise = at.y - source.y;
    if (rise < 0.05) continue;
    const dx = source.x - at.x;
    const dz = source.z - at.z;
    const flat = Math.hypot(dx, dz);
    const coat = GLASS_COAT[dome.glass] ?? GLASS_COAT.gold;
    const reach = at.radius * (1.05 + dome.diffuse * 0.85);
    if (flat > reach) continue;
    const inside = flat <= at.radius ? 1 : Math.max(0, 1 - (flat - at.radius) / Math.max(0.05, reach - at.radius));
    const edge = flat <= at.radius ? 1 - flat / Math.max(0.05, at.radius) : inside * 0.65;
    const ratio = Math.max(40, frequency) / Math.max(40, dome.frequency);
    const tune = Math.exp(-Math.abs(Math.log2(ratio)) * 4.2);
    const softness = Math.min(0.9, dome.diffuse * (0.55 + coat.body));
    const focus = 1 - softness * 0.72;
    const coverage = Math.min(1, (at.radius * 2) / HALL_DIAMETER);
    const mix =
      dome.reflect *
      coat.gain *
      inside *
      (0.28 + 0.72 * tune) *
      (0.35 + 0.65 * focus) *
      (0.35 + 0.65 * Math.max(edge, inside * 0.4)) *
      (0.9 + 0.45 * coverage);
    const cutoff =
      (700 + dome.brightness * (4200 + 9000 * tune) * (0.45 + 0.55 * (1 - softness * 0.45))) * coat.air;
    const slant = Math.hypot(flat, rise);
    const pull = flat <= at.radius ? 0.12 : 0.72;
    out.push({
      x: source.x + (at.x - source.x) * pull,
      y: at.y,
      z: source.z + (at.z - source.z) * pull,
      mix,
      cutoff,
      delay: Math.min(0.22, (slant * 2) / 343),
    });
  }
  return out;
}
