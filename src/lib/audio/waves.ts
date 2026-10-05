import type { RoomShapeId } from "@/lib/audio/types";

export type WaveLimits = { minX: number; maxX: number; minY: number; maxY: number };

export type WaveBowl = {
  id: string;
  x: number;
  y: number;
  frequency: number;
  gain: number;
  muted?: boolean;
};

export type WaveEar = { id: string; x: number; y: number };

export type WavePoint = { x: number; y: number };

export type WaveCrossing = WavePoint & { aId: string; bId: string };

export type WaveDome = {
  id: string;
  x: number;
  y: number;
  size: number;
  reflect: number;
  diffuse?: number;
  frequency?: number;
  height?: number;
  /** Opening radius in floor units. Omitted covers stay on the older small scale. */
  cover?: number;
};

export type WaveRing = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  kind: "direct" | "bounce" | "dome";
  bowlId: string;
  domeId?: string;
};

export type WaveImpact = { x: number; y: number; bowlId: string };

export type WaveBowlHit = { x: number; y: number; fromId: string; toId: string };

export type WaveSample = {
  polygon: WavePoint[];
  rings: WaveRing[];
  impacts: WaveImpact[];
  crossings: WaveCrossing[];
  /** A front from one bowl arriving at another. */
  bowlHits: WaveBowlHit[];
  hits: string[];
  /** Changes as the fronts move. Stable only when motion is frozen. */
  phase: string;
};

const BOXES = new Set<RoomShapeId>(["cube", "shoebox", "corridor", "chapel", "nave", "court", "golden", "gilded"]);

function spanOf(limits: WaveLimits): number {
  return Math.hypot(limits.maxX - limits.minX, limits.maxY - limits.minY);
}

function mapUnit(x: number, y: number, limits: WaveLimits): WavePoint {
  return {
    x: limits.minX + ((x + 1) / 2) * (limits.maxX - limits.minX),
    y: limits.minY + ((y + 1) / 2) * (limits.maxY - limits.minY),
  };
}

function signedArea(points: WavePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Room outline in the same normalized floor space as the bowls. */
export function roomPolygon(shape: RoomShapeId, limits: WaveLimits): WavePoint[] {
  if (BOXES.has(shape)) {
    return [
      { x: limits.minX, y: limits.minY },
      { x: limits.maxX, y: limits.minY },
      { x: limits.maxX, y: limits.maxY },
      { x: limits.minX, y: limits.maxY },
    ];
  }
  if (shape === "octagon") {
    const points: WavePoint[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
      points.push(mapUnit(Math.cos(angle) * 0.98, Math.sin(angle) * 0.98, limits));
    }
    return points;
  }
  if (shape === "fan") {
    return [
      mapUnit(-0.55, -1, limits),
      mapUnit(0.55, -1, limits),
      mapUnit(1, 1, limits),
      mapUnit(-1, 1, limits),
    ];
  }
  if (shape === "apse") {
    const points = [mapUnit(-0.72, -0.98, limits), mapUnit(0.72, -0.98, limits), mapUnit(0.72, 0.08, limits)];
    for (let i = 0; i <= 12; i++) {
      const angle = (Math.PI * i) / 12;
      points.push(mapUnit(Math.cos(angle) * 0.72, 0.08 + Math.sin(angle) * 0.72, limits));
    }
    return points;
  }
  const points: WavePoint[] = [];
  const steps = shape === "ellipse" || shape === "rotunda" || shape === "dome" || shape === "cave" ? 28 : 24;
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push(mapUnit(Math.cos(angle) * 0.98, Math.sin(angle) * 0.98, limits));
  }
  return points;
}

function edges(poly: WavePoint[]): [WavePoint, WavePoint][] {
  return poly.map((point, index) => [point, poly[(index + 1) % poly.length]!] as [WavePoint, WavePoint]);
}

export function reflectPoint(point: WavePoint, a: WavePoint, b: WavePoint): WavePoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { x: px * 2 - point.x, y: py * 2 - point.y };
}

function distToSeg(point: WavePoint, a: WavePoint, b: WavePoint): { dist: number; x: number; y: number; on: boolean } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { dist: Math.hypot(point.x - x, point.y - y), x, y, on: t > 0.02 && t < 0.98 };
}

export function pointInPoly(point: WavePoint, poly: WavePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const hit = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function circleHits(a: WaveRing, b: WaveRing): WavePoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-4 || d > a.radius + b.radius || d < Math.abs(a.radius - b.radius)) return [];
  const h = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d);
  const px = a.x + (h * dx) / d;
  const py = a.y + (h * dy) / d;
  const lift = Math.sqrt(Math.max(0, a.radius * a.radius - h * h));
  const ox = (-dy / d) * lift;
  const oy = (dx / d) * lift;
  return [
    { x: px + ox, y: py + oy },
    { x: px - ox, y: py - oy },
  ];
}

/**
 * Fronts leaving each bowl, plus the first bounce off every wall.
 * Radii are in the same normalized floor units as the bowls.
 */
export function sampleWaves(input: {
  bowls: WaveBowl[];
  ears: WaveEar[];
  shape: RoomShapeId;
  limits: WaveLimits;
  time: number;
  domes?: WaveDome[];
}): WaveSample {
  const limits = input.limits;
  const polygon = roomPolygon(input.shape, limits);
  if (signedArea(polygon) === 0) {
    return { polygon, rings: [], impacts: [], crossings: [], bowlHits: [], hits: [], phase: "0" };
  }
  const reach = Math.max(0.2, spanOf(limits) * 0.78);
  const rings: WaveRing[] = [];
  const impacts: WaveImpact[] = [];
  const wall = edges(polygon);

  for (const bowl of input.bowls) {
    const speed = 0.18 + Math.min(0.34, bowl.frequency / 1500);
    const loud = (bowl.muted ? 0.16 : 0.92) * Math.max(0.28, Math.min(1, bowl.gain));
    const at = { x: bowl.x, y: bowl.y };
    for (let index = 0; index < 3; index++) {
      const phase = (input.time * speed + index / 3) % 1;
      const radius = Math.max(0.012, phase * reach);
      const alpha = (1 - phase) * loud;
      rings.push({ x: bowl.x, y: bowl.y, radius, alpha, kind: "direct", bowlId: bowl.id });
      for (const [a, b] of wall) {
        const mirror = reflectPoint(at, a, b);
        const seam = distToSeg(at, a, b);
        if (Math.abs(seam.dist - radius) < reach * 0.08 && seam.on && alpha > 0.12) {
          impacts.push({ x: seam.x, y: seam.y, bowlId: bowl.id });
        }
        const gate = distToSeg(mirror, a, b).dist;
        if (radius > gate * 0.92 && radius < gate + reach * 0.55) {
          rings.push({
            x: mirror.x,
            y: mirror.y,
            radius,
            alpha: alpha * 0.62,
            kind: "bounce",
            bowlId: bowl.id,
          });
        }
      }
    }
    for (const dome of input.domes ?? []) {
      if (dome.reflect < 0.04) continue;
      const cover = typeof dome.cover === "number" ? dome.cover : 0.08 + dome.size * 0.34;
      const dist = Math.hypot(bowl.x - dome.x, bowl.y - dome.y);
      const near = Math.max(0, dist - cover);
      const far = dist + cover;
      const climb = 0.04 + Math.max(0, dome.height ?? 1.2) * 0.035;
      const ratio = Math.max(40, bowl.frequency) / Math.max(40, dome.frequency || bowl.frequency);
      const tune = Math.exp(-Math.abs(Math.log2(ratio)) * 3.4);
      const spread = 0.55 + (dome.diffuse ?? 0.2) * 0.9;
      let best: { travel: number; alpha: number } | null = null;
      for (let index = 0; index < 3; index++) {
        const phase = (input.time * speed + index / 3) % 1;
        const radius = Math.max(0.012, phase * reach);
        const alpha = (1 - phase) * loud;
        const gate = near + climb;
        if (radius < gate || radius > far + climb + reach * 0.08) continue;
        const weight = alpha * dome.reflect * (0.35 + 0.65 * tune);
        if (!best || weight > best.alpha) best = { travel: radius - gate, alpha: weight };
      }
      if (!best) continue;
      const pulse = (0.42 + 0.58 * Math.min(1, best.travel / Math.max(0.05, cover))) * Math.min(1.15, spread);
      rings.push({
        x: dome.x,
        y: dome.y,
        radius: Math.max(0.02, cover * pulse),
        alpha: Math.min(1, best.alpha * 1.2),
        kind: "dome",
        bowlId: bowl.id,
        domeId: dome.id,
      });
    }
  }

  const direct = rings.filter((ring) => ring.kind === "direct" && ring.alpha > 0.2);
  const crossings: WaveCrossing[] = [];
  for (let i = 0; i < direct.length && crossings.length < 16; i++) {
    for (let j = i + 1; j < direct.length && crossings.length < 16; j++) {
      if (direct[i]!.bowlId === direct[j]!.bowlId) continue;
      for (const hit of circleHits(direct[i]!, direct[j]!)) {
        if (pointInPoly(hit, polygon)) crossings.push({ ...hit, aId: direct[i]!.bowlId, bId: direct[j]!.bowlId });
      }
    }
  }

  const slack = reach * 0.05;
  const bowlHits: WaveBowlHit[] = [];
  for (const ring of direct) {
    if (bowlHits.length >= 24) break;
    for (const other of input.bowls) {
      if (other.id === ring.bowlId) continue;
      const distance = Math.hypot(ring.x - other.x, ring.y - other.y);
      if (Math.abs(distance - ring.radius) < slack) {
        bowlHits.push({ x: other.x, y: other.y, fromId: ring.bowlId, toId: other.id });
      }
    }
  }
  const hits = input.ears
    .filter((ear) =>
      direct.some((ring) => Math.abs(Math.hypot(ring.x - ear.x, ring.y - ear.y) - ring.radius) < slack),
    )
    .map((ear) => ear.id);

  const phase = direct
    .map((ring) => `${ring.bowlId}:${ring.radius.toFixed(3)}`)
    .sort()
    .join("|");

  return { polygon, rings, impacts, crossings, bowlHits, hits, phase };
}
