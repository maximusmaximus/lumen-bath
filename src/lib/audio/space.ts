import { getRoom } from "@/lib/audio/rooms";
import type { Ear, EarSide, Receiver, RoomShapeId } from "@/lib/audio/types";

export const DEFAULT_RECEIVER: Receiver = { x: 0.62, y: 0.86, height: 0.64, yaw: 0 };

export const DEFAULT_LEFT: EarSide = { x: -0.12, y: 0, z: 0.02, gain: 1, size: 0.72 };
export const DEFAULT_RIGHT: EarSide = { x: 0.12, y: 0, z: 0.02, gain: 1, size: 0.72 };
export const EAR_SIDE_REACH = 0.85;
/** Matches the cone handles in the room. Parts are checked in that same scale. */
export const EAR_PART_SCALE = 5;

export const EAR_LOW = 0.18;
export const EAR_HIGH = 2.15;
/** Height is 1 at the old ceiling. 4 reaches four times that lift. */
export const EAR_HEIGHT_MAX = 4;
/** How far the ear can look down. */
export const EAR_PITCH_MAX = (75 * Math.PI) / 180;

type SpreadSettings = {
  width: number;
  depth: number;
  roomShape?: RoomShapeId;
  size?: number;
  layoutSpanX?: number;
  layoutSpanZ?: number;
};

/** Half-extent of the floor mesh is `spread * FLOOR_SCALE` (unit floor radius is 1). */
export const FLOOR_SCALE = 0.62;

export const BOWL_LIFT_MIN = 0.04;
export const BOWL_LIFT_MAX = 2.05;

export function bowlLift(gain: number): number {
  const level = Math.min(1, Math.max(0, gain));
  return BOWL_LIFT_MIN + level * (BOWL_LIFT_MAX - BOWL_LIFT_MIN);
}

export function liftToGain(y: number): number {
  const span = BOWL_LIFT_MAX - BOWL_LIFT_MIN;
  return Math.min(1, Math.max(0.05, (y - BOWL_LIFT_MIN) / span));
}

export function defaultHeight(size: number): number {
  return Math.min(1, Math.max(0.22, 0.3 + size * 0.48));
}

export function wrapAngle(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

export function roomSpread(settings: SpreadSettings): { x: number; z: number } {
  const room = getRoom(settings.roomShape);
  const size = Math.min(8, Math.max(1, settings.size ?? 4));
  const spanX = settings.layoutSpanX ?? room.spanX;
  const spanZ = settings.layoutSpanZ ?? room.spanZ;
  const x = 6.4 * (0.62 + settings.width * 0.58);
  const z = 6.4 * (0.62 + settings.depth * 0.58);
  return {
    x: x * (spanX / 7.2) * size,
    z: z * (spanZ / 7.2) * size,
  };
}

export function bowlDiameter(size: number): number {
  const clamped = Math.min(1, Math.max(0.36, size));
  return 2 * (0.26 + clamped * 0.92);
}

/** Sum of the glass diameters. The floor is not allowed to shrink inside this. */
export function totalBowlDiameter(bowls: readonly { size: number }[]): number {
  let total = 0;
  for (const bowl of bowls) total += bowlDiameter(bowl.size);
  return total;
}

type ReachBowl = { x: number; y: number; size: number; height: number; gain?: number };

function bowlReach(bowls: readonly ReachBowl[], settings: SpreadSettings): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const bowl of bowls) {
    const placed = bowlPoint(bowl, settings);
    x = Math.max(x, Math.abs(placed.x) + placed.radius + 0.35);
    z = Math.max(z, Math.abs(placed.z) + placed.radius + 0.35);
  }
  return { x, z };
}

/**
 * Floor scale for the walls. Bowls stay on `roomSpread`.
 * A new shape may stretch an axis outward so the glass does not jump.
 * Bowl and ear size never feed this — resizing an element does not resize the room.
 */
export function roomMeshSpread(settings: SpreadSettings, _bowls?: readonly ReachBowl[]): { x: number; z: number } {
  const layout = roomSpread(settings);
  const room = getRoom(settings.roomShape);
  const pinX = settings.layoutSpanX ?? room.spanX;
  const pinZ = settings.layoutSpanZ ?? room.spanZ;
  return {
    x: layout.x * Math.max(1, room.spanX / pinX),
    z: layout.z * Math.max(1, room.spanZ / pinZ),
  };
}

function layoutFits(settings: SpreadSettings, bowls: readonly ReachBowl[]): boolean {
  const spread = roomSpread(settings);
  const halfX = FLOOR_SCALE * spread.x;
  const halfZ = FLOOR_SCALE * spread.z;
  const total = totalBowlDiameter(bowls);
  if (Math.min(halfX, halfZ) * 2 < total - 1e-3) return false;
  const reach = bowlReach(bowls, settings);
  return reach.x <= halfX + 1e-3 && reach.z <= halfZ + 1e-3;
}

/** Smallest room-size multiplier that still holds the bowls. */
export function minRoomSize(settings: SpreadSettings, bowls: readonly ReachBowl[]): number {
  const hiCap = 8;
  if (layoutFits({ ...settings, size: 1 }, bowls)) return 1;
  let lo = 1;
  let hi = hiCap;
  if (!layoutFits({ ...settings, size: hi }, bowls)) return hi;
  for (let step = 0; step < 18; step++) {
    const mid = (lo + hi) / 2;
    if (layoutFits({ ...settings, size: mid }, bowls)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Keep a width / depth / size edit from pulling the floor inside the bowls. */
export function clampRoomLayout<T extends SpreadSettings>(prev: T, next: T, bowls: readonly ReachBowl[]): T {
  if (layoutFits(next, bowls)) return next;
  if (!layoutFits(prev, bowls)) {
    let lo = Math.min(8, Math.max(1, next.size ?? 4));
    let hi = 8;
    if (!layoutFits({ ...next, size: hi }, bowls)) return { ...next, size: hi };
    for (let step = 0; step < 18; step++) {
      const mid = (lo + hi) / 2;
      if (layoutFits({ ...next, size: mid }, bowls)) hi = mid;
      else lo = mid;
    }
    return { ...next, size: hi };
  }
  const mix = (t: number): T => ({
    ...next,
    size: (prev.size ?? 4) + ((next.size ?? 4) - (prev.size ?? 4)) * t,
    width: prev.width + (next.width - prev.width) * t,
    depth: prev.depth + (next.depth - prev.depth) * t,
  });
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 18; step++) {
    const mid = (lo + hi) / 2;
    if (layoutFits(mix(mid), bowls)) lo = mid;
    else hi = mid;
  }
  return mix(lo);
}

export function bowlPoint(
  bowl: { x: number; y: number; size: number; height: number; gain?: number },
  settings: SpreadSettings,
): { x: number; y: number; z: number; radius: number; wall: number; lift: number } {
  const spread = roomSpread(settings);
  const radius = 0.26 + bowl.size * 0.92;
  const wall = 0.14 + bowl.height * 1.15;
  const lift = bowlLift(bowl.gain ?? 0.7);
  return {
    x: (bowl.x - 0.5) * spread.x,
    z: (bowl.y - 0.5) * spread.z,
    y: lift + wall * 0.62,
    radius,
    wall,
    lift,
  };
}

export function clampEarHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_RECEIVER.height;
  return Math.min(EAR_HEIGHT_MAX, Math.max(0, height));
}

export function earPitch(receiver: { pitch?: number }): number {
  const pitch = receiver.pitch ?? 0;
  if (!Number.isFinite(pitch)) return 0;
  return Math.min(EAR_PITCH_MAX, Math.max(0, pitch));
}

/** Where one horn points. The ear tilt plus that horn's own aim, from straight up to straight down. */
export function hornPitch(ear: { pitch?: number }, side: { pitch?: number }): number {
  const extra = side.pitch ?? 0;
  const sum = earPitch(ear) + (Number.isFinite(extra) ? extra : 0);
  return Math.min(Math.PI / 2, Math.max(-Math.PI / 2, sum));
}

/** Where one horn points across the room. The ear's facing, plus that horn's own turn. */
export function hornYaw(ear: Receiver, side: { yaw?: number }, settings: SpreadSettings): number {
  const extra = side.yaw ?? 0;
  return facingYaw(ear, settings) + (Number.isFinite(extra) ? extra : 0);
}

/** Aim shared by the two horns, so the listener sits between them. */
export function listenPitch(ear: { pitch?: number; left: { pitch?: number }; right: { pitch?: number } }): number {
  return (hornPitch(ear, ear.left) + hornPitch(ear, ear.right)) / 2;
}

export function listenForward(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const level = Math.cos(pitch);
  return { x: Math.sin(yaw) * level, y: -Math.sin(pitch), z: Math.cos(yaw) * level };
}

export function listenUp(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const drop = Math.sin(pitch);
  return { x: -Math.sin(yaw) * drop, y: Math.cos(pitch), z: -Math.cos(yaw) * drop };
}

/** How directly a sound arrives into a cone. 1 is straight into the opening. Behind it is quiet. */
export function hitCone(
  source: { x: number; y: number; z: number },
  cap: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
): number {
  const dx = source.x - cap.x;
  const dy = source.y - cap.y;
  const dz = source.z - cap.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-3) return 1;
  const forward = listenForward(yaw, pitch);
  const facing = (dx * forward.x + dy * forward.y + dz * forward.z) / dist;
  return Math.min(1, Math.max(0.08, 0.12 + 0.88 * Math.max(0, facing)));
}

export function receiverPoint(receiver: Receiver, settings: SpreadSettings): { x: number; y: number; z: number } {
  const spread = roomSpread(settings);
  const height = clampEarHeight(receiver.height);
  return {
    x: (receiver.x - 0.5) * spread.x,
    z: (receiver.y - 0.5) * spread.z,
    y: EAR_LOW + height * (EAR_HIGH - EAR_LOW),
  };
}

/** Absolute yaw the ear is facing: toward the middle, plus the listener's turn. */
export function facingYaw(receiver: Receiver, settings: SpreadSettings): number {
  const placed = receiverPoint(receiver, settings);
  const mag = Math.hypot(placed.x, placed.z);
  const toward = mag < 0.001 ? Math.PI : Math.atan2(-placed.x, -placed.z);
  return toward + (Number.isFinite(receiver.yaw) ? receiver.yaw : 0);
}

const BOX_ROOMS = new Set<RoomShapeId>(["cube", "shoebox", "corridor", "chapel", "nave", "court", "golden", "gilded"]);

export type NormLimits = { minX: number; maxX: number; minY: number; maxY: number };

/** Normalized range that covers the floor you can see, including a shape that opened the walls. */
export function floorNormLimits(settings: SpreadSettings, bowls: readonly ReachBowl[] = []): NormLimits {
  const spread = roomSpread(settings);
  const mesh = roomMeshSpread(settings, bowls);
  const margin = 0.92;
  const limX = (mesh.x * FLOOR_SCALE * margin) / Math.max(spread.x, 0.001);
  const limZ = (mesh.z * FLOOR_SCALE * margin) / Math.max(spread.z, 0.001);
  return {
    minX: 0.5 - limX,
    maxX: 0.5 + limX,
    minY: 0.5 - limZ,
    maxY: 0.5 + limZ,
  };
}

/** Keep a floor point inside the current room, even after the size or the shape changes. */
export function clampSpot(
  x: number,
  y: number,
  settings: SpreadSettings,
  bowls: readonly ReachBowl[] = [],
  pad = 0,
): { x: number; y: number } {
  const spread = roomSpread(settings);
  const limits = floorNormLimits(settings, bowls);
  const padX = pad / Math.max(spread.x, 0.001);
  const padY = pad / Math.max(spread.z, 0.001);
  let minX = limits.minX + padX;
  let maxX = limits.maxX - padX;
  let minY = limits.minY + padY;
  let maxY = limits.maxY - padY;
  if (minX > maxX) {
    const mid = (limits.minX + limits.maxX) / 2;
    minX = mid;
    maxX = mid;
  }
  if (minY > maxY) {
    const mid = (limits.minY + limits.maxY) / 2;
    minY = mid;
    maxY = mid;
  }
  let nx = clampNorm(x, minX, maxX);
  let ny = clampNorm(y, minY, maxY);
  const shape = settings.roomShape ?? "rotunda";
  if (!BOX_ROOMS.has(shape)) {
    const hx = Math.max(0.001, (maxX - minX) / 2);
    const hz = Math.max(0.001, (maxY - minY) / 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const dx = (nx - cx) / hx;
    const dz = (ny - cy) / hz;
    const radius = Math.hypot(dx, dz);
    if (radius > 1) {
      nx = cx + (dx / radius) * hx;
      ny = cy + (dz / radius) * hz;
    }
  }
  return { x: nx, y: ny };
}

export function insideFloor(x: number, z: number, settings: SpreadSettings, bowls: readonly ReachBowl[] = []): boolean {
  const mesh = roomMeshSpread(settings, bowls);
  const halfX = mesh.x * FLOOR_SCALE * 1.04;
  const halfZ = mesh.z * FLOOR_SCALE * 1.04;
  if (halfX < 0.01 || halfZ < 0.01) return false;
  const shape = settings.roomShape ?? "rotunda";
  if (!BOX_ROOMS.has(shape)) {
    const nx = x / halfX;
    const nz = z / halfZ;
    return nx * nx + nz * nz <= 1;
  }
  return Math.abs(x) <= halfX && Math.abs(z) <= halfZ;
}

export function floorToNorm(
  x: number,
  z: number,
  settings: SpreadSettings,
  bowls: readonly ReachBowl[] = [],
): { x: number; y: number } {
  const spread = roomSpread(settings);
  return clampSpot(x / spread.x + 0.5, z / spread.z + 0.5, settings, bowls, 0);
}

export function worldEarToHeight(y: number): number {
  return Math.min(EAR_HEIGHT_MAX, Math.max(0, (y - EAR_LOW) / (EAR_HIGH - EAR_LOW)));
}

export function earSide(input: Partial<EarSide> | undefined, fallback: EarSide): EarSide {
  const x = Number.isFinite(input?.x) ? (input!.x as number) : fallback.x;
  const y = Number.isFinite(input?.y) ? (input!.y as number) : fallback.y;
  const z = Number.isFinite(input?.z) ? (input!.z as number) : fallback.z;
  const gain = Number.isFinite(input?.gain) ? (input!.gain as number) : fallback.gain;
  const size = Number.isFinite(input?.size) ? (input!.size as number) : fallback.size;
  const pitch = Number.isFinite(input?.pitch) ? (input!.pitch as number) : fallback.pitch;
  const yaw = Number.isFinite(input?.yaw) ? (input!.yaw as number) : fallback.yaw;
  return clampSide({ x, y, z, gain, size, pitch, yaw });
}

export const CONE_MIN = 0.28;
export const CONE_MAX = 1.8;

/** How far the drawn cone hangs below its center. Matches the room mesh. */
export function coneHang(size: number): number {
  const clamped = Math.min(CONE_MAX, Math.max(CONE_MIN, Number.isFinite(size) ? size : 0.72));
  return 0.28 * 1.15 * clamped;
}

export function clampSide(side: EarSide): EarSide {
  const gain = Math.min(1, Math.max(0, side.gain));
  const size = Math.min(CONE_MAX, Math.max(CONE_MIN, Number.isFinite(side.size) ? side.size : 0.72));
  let x = side.x;
  let y = side.y;
  let z = side.z;
  const reach = Math.hypot(x, y, z);
  if (reach > EAR_SIDE_REACH) {
    const scale = EAR_SIDE_REACH / reach;
    x *= scale;
    y *= scale;
    z *= scale;
  }
  const extra = side.pitch ?? 0;
  const pitch = Math.min(Math.PI, Math.max(-Math.PI, Number.isFinite(extra) ? extra : 0));
  const spin = side.yaw ?? 0;
  const yaw = Math.min(Math.PI, Math.max(-Math.PI, Number.isFinite(spin) ? spin : 0));
  return { x, y, z, gain, size, pitch, yaw };
}

/** How strongly this cone picks up the glass. Default size stays near the old gain. */
export function coneGain(side: EarSide): number {
  const size = Number.isFinite(side.size) ? side.size : 0.72;
  return Math.min(1.8, Math.max(0, side.gain * (0.55 + size * 0.62)));
}

export function makeEar(receiver: Receiver, id: string, left?: Partial<EarSide>, right?: Partial<EarSide>): Ear {
  return {
    id,
    x: receiver.x,
    y: receiver.y,
    height: receiver.height,
    yaw: receiver.yaw,
    pitch: earPitch(receiver),
    left: earSide(left, DEFAULT_LEFT),
    right: earSide(right, DEFAULT_RIGHT),
  };
}

/** World offset of a capsule. Pitch swings it down around the ear’s right axis. */
export function capsuleWorld(side: EarSide, yaw: number, pitch = 0): { x: number; y: number; z: number } {
  const drop = Math.sin(pitch);
  const level = Math.cos(pitch);
  const y = side.y * level - side.z * drop;
  const z = side.z * level + side.y * drop;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return {
    x: rightX * side.x + forwardX * z,
    y,
    z: rightZ * side.x + forwardZ * z,
  };
}

export function capsulePoint(ear: Ear, side: EarSide, settings: SpreadSettings): { x: number; y: number; z: number } {
  const head = receiverPoint(ear, settings);
  const yaw = facingYaw(ear, settings);
  const pitch = hornPitch(ear, side);
  const handle = capsuleWorld(side, yaw, 0);
  const flat = coneCenter(head, side, yaw, side.size, 0);
  const tilted = coneCenter(head, side, yaw, side.size, pitch);
  return {
    x: head.x + handle.x + (tilted.x - flat.x),
    y: head.y + handle.y + (tilted.y - flat.y),
    z: head.z + handle.z + (tilted.z - flat.z),
  };
}

/** Where the room draws this cone. The wide mouth faces the sound. */
export function drawnCone(ear: Ear, side: EarSide, settings: SpreadSettings): { x: number; y: number; z: number } {
  const head = receiverPoint(ear, settings);
  const yaw = facingYaw(ear, settings);
  return coneCenter(head, side, yaw, side.size, hornPitch(ear, side), hornYaw(ear, side, settings));
}

/** The opening of a horn, where a front can enter. */
export function hornMouth(ear: Ear, side: EarSide, settings: SpreadSettings): { x: number; y: number; z: number } {
  const center = drawnCone(ear, side, settings);
  const yaw = hornYaw(ear, side, settings);
  const pitch = hornPitch(ear, side);
  const forward = listenForward(yaw, pitch);
  const half = 0.45 * 1.35 * Math.min(CONE_MAX, Math.max(CONE_MIN, side.size || 0.72));
  return {
    x: center.x + forward.x * half,
    y: Math.max(FLOOR_Y, center.y + forward.y * half),
    z: center.z + forward.z * half,
  };
}

export type ConeCatch = { level: number; delay: number; cutoff: number; facing: number; dist: number };

/** What one hollow horn gathers from a single point in the room. */
export function coneCatch(
  source: { x: number; y: number; z: number },
  mouth: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  size: number,
  gain: number,
): ConeCatch {
  const dx = source.x - mouth.x;
  const dy = source.y - mouth.y;
  const dz = source.z - mouth.z;
  const dist = Math.max(0.05, Math.hypot(dx, dy, dz));
  const forward = listenForward(yaw, pitch);
  const facing = Math.max(0, (dx * forward.x + dy * forward.y + dz * forward.z) / dist);
  const span = Math.min(1, Math.max(0, (size - CONE_MIN) / (CONE_MAX - CONE_MIN)));
  const beam = Math.pow(facing, 2.15 - span * 1.35);
  const area = Math.pow(Math.max(0.2, size) / 0.72, 1.4);
  const near = 0.85 / Math.max(0.4, dist);
  const level = Math.min(1.7, Math.max(0, gain) * (0.03 + beam) * area * near * 0.7);
  const cutoff = Math.max(380, Math.min(16000, (15000 - dist * 620) * (0.2 + 0.8 * Math.max(0.05, facing))));
  return { level, delay: Math.min(0.22, dist / 343), cutoff, facing, dist };
}

/** Direct sound plus the first bounce off the floor and the walls, kept only if the mouth faces that path. */
export type CeilingBounce = {
  x: number;
  y: number;
  z: number;
  mix: number;
  cutoff: number;
  delay: number;
};

export function gatherCone(
  source: { x: number; y: number; z: number },
  mouth: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  size: number,
  gain: number,
  settings: SpreadSettings,
  ceilings: readonly CeilingBounce[] = [],
): ConeCatch {
  const direct = coneCatch(source, mouth, yaw, pitch, size, gain);
  const mesh = roomMeshSpread(settings);
  const hx = Math.max(0.8, mesh.x * FLOOR_SCALE);
  const hz = Math.max(0.8, mesh.z * FLOOR_SCALE);
  const images = [
    { at: { x: source.x, y: -source.y, z: source.z }, mix: 0.42 },
    { at: { x: 2 * hx - source.x, y: source.y, z: source.z }, mix: 0.3 },
    { at: { x: -2 * hx - source.x, y: source.y, z: source.z }, mix: 0.3 },
    { at: { x: source.x, y: source.y, z: 2 * hz - source.z }, mix: 0.3 },
    { at: { x: source.x, y: source.y, z: -2 * hz - source.z }, mix: 0.3 },
  ];
  let level = direct.level;
  let best = direct;
  let bestLevel = direct.level;
  let domeShare = 0;
  let domeBest = 0;
  let domeDelay = direct.delay;
  let domeCutoff = direct.cutoff;
  for (const image of images) {
    const caught = coneCatch(image.at, mouth, yaw, pitch, size, gain);
    const share = caught.level * image.mix;
    level += share;
    if (share > bestLevel) {
      bestLevel = share;
      best = { ...caught, level: share };
    }
  }
  for (const dome of ceilings) {
    const image = { x: dome.x, y: dome.y + (dome.y - source.y), z: dome.z };
    const caught = coneCatch(image, mouth, yaw, pitch, size, gain);
    const share = caught.level * dome.mix;
    level += share;
    domeShare += share;
    if (share > domeBest) {
      domeBest = share;
      domeDelay = Math.min(0.22, caught.delay + dome.delay);
      domeCutoff = Math.min(caught.cutoff, dome.cutoff);
    }
    if (share > bestLevel) {
      bestLevel = share;
      best = { ...caught, level: share, delay: Math.min(0.22, caught.delay + dome.delay), cutoff: Math.min(caught.cutoff, dome.cutoff) };
    }
  }
  const heard = Math.min(1.85, level);
  const domeWeight = heard > 0 ? Math.min(0.85, domeShare / heard) : 0;
  return {
    level: heard,
    delay: best.delay * (1 - domeWeight) + Math.min(0.22, domeDelay || best.delay) * domeWeight,
    cutoff: best.cutoff * (1 - domeWeight) + domeCutoff * domeWeight,
    facing: direct.facing,
    dist: direct.dist,
  };
}

const BODY_PAD = 0.52;
const FLOOR_Y = 0.02;

function roomWalls(settings: SpreadSettings, bowls: readonly ReachBowl[]) {
  const mesh = roomMeshSpread(settings, bowls);
  const shape = settings.roomShape ?? "rotunda";
  return {
    hx: Math.max(0.8, mesh.x * FLOOR_SCALE - 0.08),
    hz: Math.max(0.8, mesh.z * FLOOR_SCALE - 0.08),
    box: BOX_ROOMS.has(shape),
  };
}

function pushInside(x: number, z: number, hx: number, hz: number, box: boolean, pad: number) {
  const ix = Math.max(0.2, hx - pad);
  const iz = Math.max(0.2, hz - pad);
  if (box) {
    return { x: Math.min(ix, Math.max(-ix, x)), z: Math.min(iz, Math.max(-iz, z)) };
  }
  const nx = x / ix;
  const nz = z / iz;
  const radius = Math.hypot(nx, nz);
  if (radius <= 1 || radius < 1e-6) return { x, z };
  return { x: (nx / radius) * ix, z: (nz / radius) * iz };
}

function pointInside(x: number, z: number, hx: number, hz: number, box: boolean) {
  if (box) return Math.abs(x) <= hx + 1e-3 && Math.abs(z) <= hz + 1e-3;
  return (x / hx) * (x / hx) + (z / hz) * (z / hz) <= 1.001;
}

/** Cone mesh samples, in the same place the room draws them. */
function coneSamples(
  head: { x: number; y: number; z: number },
  side: EarSide,
  yaw: number,
  size: number,
  pitch = 0,
  aimYaw = yaw,
) {
  const center = coneCenter(head, side, yaw, size, pitch, aimYaw);
  const forward = listenForward(aimYaw, pitch);
  const up = listenUp(yaw, pitch);
  const rx = up.y * forward.z - up.z * forward.y;
  const ry = up.z * forward.x - up.x * forward.z;
  const rz = up.x * forward.y - up.y * forward.x;
  const length = 1.35 * size;
  const girth = 1.15 * size;
  const rad = 0.28 * girth;
  const half = 0.45 * length;
  const points: { x: number; y: number; z: number }[] = [];
  for (const along of [-half, 0, half]) {
    const px = center.x + forward.x * along;
    const py = center.y + forward.y * along;
    const pz = center.z + forward.z * along;
    points.push({ x: px, y: py, z: pz });
    points.push({ x: px + up.x * rad, y: py + up.y * rad, z: pz + up.z * rad });
    points.push({ x: px - up.x * rad, y: py - up.y * rad, z: pz - up.z * rad });
    points.push({ x: px + rx * rad, y: py + ry * rad, z: pz + rz * rad });
    points.push({ x: px - rx * rad, y: py - ry * rad, z: pz - rz * rad });
  }
  return points;
}

function coneCenter(
  head: { x: number; y: number; z: number },
  side: EarSide,
  yaw: number,
  size: number,
  pitch = 0,
  aimYaw = yaw,
) {
  const cap = capsuleWorld(side, yaw, pitch);
  const forward = listenForward(aimYaw, pitch);
  const length = 1.35 * size;
  const y = head.y + cap.y * EAR_PART_SCALE + forward.y * length * 0.55;
  return {
    x: head.x + cap.x * EAR_PART_SCALE + forward.x * length * 0.55,
    y: Math.max(FLOOR_Y + coneHang(size), y),
    z: head.z + cap.z * EAR_PART_SCALE + forward.z * length * 0.55,
  };
}

/**
 * Keep the ear, its stand, and both cones inside the room.
 * Cones cannot be dragged through the floor, a wall, a bowl, or another ear.
 */
export function containEar(
  ear: Ear,
  settings: SpreadSettings,
  bowls: readonly SolidBowl[] = [],
  peers: readonly Ear[] = [],
): Ear {
  const walls = roomWalls(settings, bowls);
  const spread = roomSpread(settings);
  let x = ear.x;
  let y = ear.y;
  let height = Math.min(1, Math.max(0, ear.height));
  let left = ear.left;
  let right = ear.right;
  const pose = () => ({ x, y, height, yaw: ear.yaw, pitch: ear.pitch });

  for (let step = 0; step < 4; step++) {
    const head = receiverPoint(pose(), settings);
    const held = pushInside(head.x, head.z, walls.hx, walls.hz, walls.box, BODY_PAD);
    if (Math.hypot(held.x - head.x, held.z - head.z) < 0.004) break;
    x = held.x / spread.x + 0.5;
    y = held.z / spread.z + 0.5;
  }

  for (let pass = 0; pass < 6; pass++) {
    const head = receiverPoint(pose(), settings);
    let moved = false;
    for (const bowl of bowls) {
      const body = bowlBody(bowl, settings);
      if (body.bottom >= head.y + 0.2 || body.top <= 0) continue;
      const dx = head.x - body.x;
      const dz = head.z - body.z;
      const dist = Math.hypot(dx, dz);
      const need = body.r + STAND_R + SOLID_GAP;
      if (dist >= need - 0.01) continue;
      const awayX = dist < 1e-4 ? 1 : dx / dist;
      const awayZ = dist < 1e-4 ? 0 : dz / dist;
      const held = pushInside(head.x + awayX * (need - dist), head.z + awayZ * (need - dist), walls.hx, walls.hz, walls.box, BODY_PAD);
      const nx = held.x / spread.x + 0.5;
      const ny = held.z / spread.z + 0.5;
      if (Math.abs(nx - x) < 1e-4 && Math.abs(ny - y) < 1e-4) continue;
      x = nx;
      y = ny;
      moved = true;
    }
    if (!moved) break;
  }

  const blocked = (side: EarSide, head: { x: number; y: number; z: number }, yaw: number) => {
    const samples = coneSamples(head, side, yaw, side.size, hornPitch(pose(), side), hornYaw(pose(), side, settings));
    if (samples.some((point) => point.y < FLOOR_Y)) return true;
    if (samples.some((point) => !pointInside(point.x, point.z, walls.hx, walls.hz, walls.box))) return true;
    for (const bowl of bowls) {
      const body = bowlBody(bowl, settings);
      for (const point of samples) {
        if (point.y < body.bottom - 0.04 || point.y > body.top + 0.08) continue;
        if (Math.hypot(point.x - body.x, point.z - body.z) < body.r + 0.06) return true;
      }
    }
    for (const peer of peers) {
      if (peer.id === ear.id) continue;
      const other = receiverPoint(peer, settings);
      const peerYaw = facingYaw(peer, settings);
      const solids = [
        { x: other.x, y: other.y, z: other.z, r: 0.28 },
        { ...coneCenter(other, peer.left, peerYaw, peer.left.size, hornPitch(peer, peer.left), hornYaw(peer, peer.left, settings)), r: coneHang(peer.left.size) },
        { ...coneCenter(other, peer.right, peerYaw, peer.right.size, hornPitch(peer, peer.right), hornYaw(peer, peer.right, settings)), r: coneHang(peer.right.size) },
      ];
      for (const point of samples) {
        for (const solid of solids) {
          if (Math.hypot(point.x - solid.x, point.y - solid.y, point.z - solid.z) < solid.r) return true;
        }
      }
    }
    return false;
  };

  const fitSide = (side: EarSide): EarSide => {
    const head = receiverPoint(pose(), settings);
    const yaw = facingYaw(pose(), settings);
    let size = Math.min(CONE_MAX, Math.max(CONE_MIN, side.size));
    let sx = side.x;
    let sy = side.y;
    let sz = side.z;
    for (let attempt = 0; attempt < 12; attempt++) {
      let minY = (FLOOR_Y + coneHang(size) - head.y) / EAR_PART_SCALE;
      if (minY > EAR_SIDE_REACH) {
        size = Math.max(CONE_MIN, size * 0.86);
        minY = (FLOOR_Y + coneHang(size) - head.y) / EAR_PART_SCALE;
      }
      if (sy < minY) sy = minY;
      const yAbs = Math.min(Math.abs(sy), EAR_SIDE_REACH);
      const room = Math.sqrt(Math.max(0, EAR_SIDE_REACH * EAR_SIDE_REACH - yAbs * yAbs));
      const horiz = Math.hypot(sx, sz);
      if (horiz > room && horiz > 1e-6) {
        sx *= room / horiz;
        sz *= room / horiz;
      }
      sy = (sy < 0 ? -1 : 1) * yAbs;
      if (sy < minY) sy = minY;
      const unchanged =
        Math.abs(sx - side.x) < 1e-4 &&
        Math.abs(sy - side.y) < 1e-4 &&
        Math.abs(sz - side.z) < 1e-4 &&
        Math.abs(size - side.size) < 1e-4;
      const next = unchanged ? side : { ...side, x: sx, y: sy, z: sz, size };
      if (!blocked(next, head, yaw)) return next;
      sx *= 0.7;
      sz *= 0.7;
      if (attempt > 5) size = Math.max(CONE_MIN, size * 0.9);
    }
    const minY = (FLOOR_Y + coneHang(size) - head.y) / EAR_PART_SCALE;
    return { ...side, x: sx, y: Math.max(sy, minY), z: sz, size };
  };

  left = fitSide(left);
  right = fitSide(right);

  for (let step = 0; step < 4; step++) {
    const head = receiverPoint(pose(), settings);
    const yaw = facingYaw(pose(), settings);
    const ca = coneCenter(head, left, yaw, left.size, hornPitch(pose(), left), hornYaw(pose(), left, settings));
    const cb = coneCenter(head, right, yaw, right.size, hornPitch(pose(), right), hornYaw(pose(), right, settings));
    if (!ca || !cb) break;
    const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z);
    if (dist >= coneHang(left.size) + coneHang(right.size) + 0.05) break;
    left = { ...left, x: left.x * 0.82, z: left.z * 0.82 };
    right = { ...right, x: right.x * 0.82, z: right.z * 0.82 };
    left = fitSide(left);
    right = fitSide(right);
  }

  if (x === ear.x && y === ear.y && height === ear.height && left === ear.left && right === ear.right) return ear;
  return { ...ear, x, y, height, left, right };
}

/** Listener sits halfway between the two capsules, so raising both lifts what you hear. */
export function listenPoint(ear: Ear, settings: SpreadSettings): { x: number; y: number; z: number } {
  const left = capsulePoint(ear, ear.left, settings);
  const right = capsulePoint(ear, ear.right, settings);
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

/**
 * Source in a listener-at-origin frame for this ear.
 * Forward maps to -Z, which is where the Web Audio listener looks.
 */
export function hearRelative(
  source: { x: number; y: number; z: number },
  ear: Ear,
  settings: SpreadSettings,
): { x: number; y: number; z: number } {
  const at = listenPoint(ear, settings);
  const yaw = facingYaw(ear, settings);
  const pitch = earPitch(ear);
  const dx = source.x - at.x;
  const dy = source.y - at.y;
  const dz = source.z - at.z;
  const forward = listenForward(yaw, pitch);
  const up = listenUp(yaw, pitch);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return {
    x: dx * rx + dz * rz,
    y: dx * up.x + dy * up.y + dz * up.z,
    z: -(dx * forward.x + dy * forward.y + dz * forward.z),
  };
}

const SOLID_GAP = 0.04;

export type SolidBowl = {
  id: string;
  x: number;
  y: number;
  size: number;
  height: number;
  gain: number;
};

function bowlBody(bowl: SolidBowl, settings: SpreadSettings) {
  const placed = bowlPoint(bowl, settings);
  return {
    x: placed.x,
    z: placed.z,
    r: placed.radius,
    bottom: placed.lift,
    top: placed.lift + placed.wall * 0.9,
  };
}

/** How far this bowl's glass cuts into the others. Zero means it only touches. */
export function bowlPenetration(
  bowl: SolidBowl,
  others: readonly SolidBowl[],
  settings: SpreadSettings,
  blocks: readonly SolidBlock[] = [],
): number {
  const self = bowlBody(bowl, settings);
  let total = 0;
  for (const other of others) {
    if (other.id === bowl.id) continue;
    const them = bowlBody(other, settings);
    if (self.bottom >= them.top || them.bottom >= self.top) continue;
    const dist = Math.hypot(self.x - them.x, self.z - them.z);
    const need = self.r + them.r + SOLID_GAP;
    const slack = 0.015;
    if (dist < need - slack) total += need - slack - dist;
  }
  for (const block of blocks) {
    const bottom = block.bottom ?? 0;
    if (self.bottom >= block.top || bottom >= self.top) continue;
    const dist = Math.hypot(self.x - block.x, self.z - block.z);
    const need = self.r + block.radius + SOLID_GAP;
    if (dist < need - 0.015) total += need - 0.015 - dist;
  }
  return total;
}

function clampNorm(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Slide this bowl out of the others. The others do not move. */
export function moveBowl(
  bowl: SolidBowl,
  x: number,
  y: number,
  others: readonly SolidBowl[],
  settings: SpreadSettings,
  blocks: readonly SolidBlock[] = [],
): { x: number; y: number } {
  const spread = roomSpread(settings);
  const pad = 0.26 + Math.min(1, Math.max(0.36, bowl.size)) * 0.92;
  const family = [...others, bowl];
  let next = clampSpot(x, y, settings, family, pad);
  let nx = next.x;
  let ny = next.y;
  const shove = (sx: number, sz: number, tx: number, tz: number, need: number) => {
    const dx = sx - tx;
    const dz = sz - tz;
    const dist = Math.hypot(dx, dz);
    if (dist >= need) return false;
    const awayX = dist < 1e-4 ? 1 : dx / dist;
    const awayZ = dist < 1e-4 ? 0 : dz / dist;
    const push = need - dist;
    next = clampSpot((sx + awayX * push) / spread.x + 0.5, (sz + awayZ * push) / spread.z + 0.5, settings, family, pad);
    nx = next.x;
    ny = next.y;
    return true;
  };
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    const self = bowlBody({ ...bowl, x: nx, y: ny }, settings);
    for (const other of others) {
      if (other.id === bowl.id) continue;
      const them = bowlBody(other, settings);
      if (self.bottom >= them.top || them.bottom >= self.top) continue;
      if (!shove(self.x, self.z, them.x, them.z, self.r + them.r + SOLID_GAP)) continue;
      const shifted = bowlBody({ ...bowl, x: nx, y: ny }, settings);
      self.x = shifted.x;
      self.z = shifted.z;
      moved = true;
    }
    for (const block of blocks) {
      const bottom = block.bottom ?? 0;
      if (self.bottom >= block.top || bottom >= self.top) continue;
      if (!shove(self.x, self.z, block.x, block.z, self.r + block.radius + SOLID_GAP)) continue;
      const shifted = bowlBody({ ...bowl, x: nx, y: ny }, settings);
      self.x = shifted.x;
      self.z = shifted.z;
      moved = true;
    }
    if (!moved) break;
  }
  const before = bowlPenetration(bowl, others, settings, blocks);
  const after = bowlPenetration({ ...bowl, x: nx, y: ny }, others, settings, blocks);
  if (after > before + 1e-3) return { x: bowl.x, y: bowl.y };
  return { x: nx, y: ny };
}

export function limitBowl(
  bowl: SolidBowl,
  key: "size" | "height" | "gain",
  value: number,
  min: number,
  max: number,
  others: readonly SolidBowl[],
  settings: SpreadSettings,
  blocks: readonly SolidBlock[] = [],
): number {
  const proposed = clampNorm(value, min, max);
  const score = (next: number) => bowlPenetration({ ...bowl, [key]: next }, others, settings, blocks);
  if (score(proposed) <= 1e-3) return proposed;
  const start = score(bowl[key]);
  if (score(proposed) + 1e-3 < start) return proposed;
  let best = bowl[key];
  let lo = bowl[key];
  let hi = proposed;
  for (let step = 0; step < 16; step++) {
    const mid = (lo + hi) / 2;
    if (score(mid) <= 1e-3) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export function separateBowls<T extends SolidBowl>(bowls: readonly T[], settings: SpreadSettings): T[] {
  const next = bowls.map((bowl) => ({ ...bowl }));
  let changed = false;
  for (let index = 1; index < next.length; index++) {
    const bowl = next[index]!;
    const spot = moveBowl(bowl, bowl.x, bowl.y, next.slice(0, index), settings);
    if (Math.abs(spot.x - bowl.x) > 1e-4 || Math.abs(spot.y - bowl.y) > 1e-4) {
      next[index] = { ...bowl, ...spot };
      changed = true;
    }
  }
  return changed ? next : (bowls as T[]);
}

export function openSpot(
  bowls: readonly SolidBowl[],
  settings: SpreadSettings,
  proto: SolidBowl,
): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  let bestClear = -1;
  const limits = floorNormLimits(settings, bowls);
  for (let gx = 0; gx <= 12; gx++) {
    for (let gy = 0; gy <= 10; gy++) {
      const x = limits.minX + (gx / 12) * (limits.maxX - limits.minX);
      const y = limits.minY + (gy / 10) * (limits.maxY - limits.minY);
      if (bowlPenetration({ ...proto, x, y }, bowls, settings) > 1e-3) continue;
      let clear = 8;
      for (const bowl of bowls) clear = Math.min(clear, Math.hypot(bowl.x - x, bowl.y - y));
      if (clear > bestClear) {
        bestClear = clear;
        best = { x, y };
      }
    }
  }
  if (best) return best;
  return moveBowl({ ...proto, x: 0.5, y: 0.5 }, 0.5, 0.5, bowls, settings);
}

const RIM = 0.9;
const HEIGHT_MIN = 0.22;
const HEIGHT_MAX = 1;
const GAIN_MIN = 0.05;
const WALL_BASE = 0.14;
const WALL_SCALE = 1.15;

function wallOf(height: number): number {
  return WALL_BASE + height * WALL_SCALE;
}

function heightOf(wall: number): number {
  return (wall - WALL_BASE) / WALL_SCALE;
}

export type SolidBlock = { x: number; z: number; top: number; radius: number; bottom?: number };

const STAND_R = 0.42;

/**
 * Solids the glass is not allowed to enter.
 * The stand is a column from the floor to the head. Each cone is its own ball.
 */
export function earSolids(
  ears: readonly { x: number; y: number; height: number; yaw?: number; pitch?: number; left?: EarSide; right?: EarSide }[],
  settings: SpreadSettings,
): SolidBlock[] {
  const blocks: SolidBlock[] = [];
  for (const ear of ears) {
    const pose = { x: ear.x, y: ear.y, height: ear.height, yaw: ear.yaw ?? 0, pitch: ear.pitch };
    const at = receiverPoint(pose, settings);
    const yaw = facingYaw(pose, settings);
    blocks.push({ x: at.x, z: at.z, top: at.y + 0.12, bottom: 0, radius: STAND_R });
    for (const side of [ear.left, ear.right]) {
      if (!side) continue;
      const center = coneCenter(at, side, yaw, side.size, earPitch(pose));
      const hang = coneHang(side.size);
      blocks.push({ x: center.x, z: center.z, top: center.y + hang, bottom: center.y - hang, radius: hang });
    }
  }
  return blocks;
}

/**
 * Move a bowl's base to `desiredLift` while the rim stays put.
 * Dragging the base down grows the wall. The base will not pass the floor
 * or another bowl or ear that shares its footprint.
 */
export function dropBowlBottom(
  bowl: SolidBowl,
  desiredLift: number,
  others: readonly SolidBowl[],
  settings: SpreadSettings,
  blockers: readonly SolidBlock[] = [],
): { height: number; gain: number } {
  const placed = bowlPoint(bowl, settings);
  const top = placed.lift + placed.wall * RIM;
  const minWall = wallOf(HEIGHT_MIN);
  const maxWall = wallOf(HEIGHT_MAX);
  const floor = bowlLift(GAIN_MIN);
  const liftForMax = top - maxWall * RIM;
  const liftForMin = top - minWall * RIM;
  let minLift = Math.max(floor, liftForMax);
  const self = bowlBody(bowl, settings);
  const consider = (topY: number, dist: number, need: number) => {
    if (dist >= need) return;
    if (topY >= top - 0.02) return;
    if (topY <= placed.lift + 0.03) minLift = Math.max(minLift, topY);
    else minLift = Math.max(minLift, placed.lift);
  };
  for (const other of others) {
    if (other.id === bowl.id) continue;
    const them = bowlBody(other, settings);
    const dist = Math.hypot(self.x - them.x, self.z - them.z);
    consider(them.top, dist, self.r + them.r + SOLID_GAP);
  }
  for (const block of blockers) {
    const dist = Math.hypot(self.x - block.x, self.z - block.z);
    consider(block.top, dist, self.r + block.radius + SOLID_GAP);
  }
  const lift = Math.min(liftForMin, Math.max(desiredLift, minLift));
  if (lift > liftForMin + 1e-4) return { height: bowl.height, gain: bowl.gain };
  const wall = (top - lift) / RIM;
  return {
    height: clampNorm(heightOf(wall), HEIGHT_MIN, HEIGHT_MAX),
    gain: liftToGain(lift),
  };
}

/** How far the base can still drop before the floor, another object, or full height. */
export function bowlDropRoom(
  bowl: SolidBowl,
  others: readonly SolidBowl[],
  settings: SpreadSettings,
  blockers: readonly SolidBlock[] = [],
): number {
  const placed = bowlPoint(bowl, settings);
  const next = dropBowlBottom(bowl, placed.lift - 50, others, settings, blockers);
  return placed.lift - bowlLift(next.gain);
}
