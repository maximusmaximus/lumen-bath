import type { GongId } from "@/lib/audio/gong";
import type { Bowl, Dome, Ear, Receiver, Settings } from "@/lib/audio/types";
import { MAX_BOWLS, MAX_EARS } from "@/lib/audio/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCastCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]!).join("");
}

export function cleanCastCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return null;
  if ([...code].some((char) => !ALPHABET.includes(char))) return null;
  return code;
}

export function roomForCode(code: string): string {
  return `cast${code}`;
}

export type CastRole = "display" | "control";

export type CastHello = { kind: "hello"; w: number; h: number; host: boolean };

export type CastSnap = {
  kind: "snap";
  waves: boolean;
  playing: boolean;
  bowls: Bowl[];
  settings: Settings;
  ears: Ear[];
  receiver: Receiver;
  activeEarId: string;
  selectedId: string | null;
  focus: "bowl" | "ear" | "dome";
  selection: string[];
  presetId: string | null;
  originPresetId: string | null;
  activeName: string | null;
  previewEarId?: string | null;
  cycleThrough?: boolean;
  cycleSeconds?: number;
  domes?: Dome[];
};

export type CastRecord = { kind: "record"; on: boolean };

export type CastTouch = {
  kind: "touch";
  bowlId: string;
  mode: "rim" | "gong" | "rim-off";
  amount?: number;
  mallet?: GongId;
};

export type CastBye = { kind: "bye" };

export type CastMsg = CastHello | CastSnap | CastRecord | CastTouch | CastBye;

/** Larger viewport is the stage. A near tie leaves the screen that showed the code as the stage. */
export function resolveRole(
  self: { w: number; h: number; host: boolean },
  peer: { w: number; h: number; host: boolean },
): CastRole {
  const mine = Math.max(1, self.w) * Math.max(1, self.h);
  const theirs = Math.max(1, peer.w) * Math.max(1, peer.h);
  if (mine > theirs * 1.12) return "display";
  if (theirs > mine * 1.12) return "control";
  return self.host ? "display" : "control";
}

/**
 * Stage drawing. A desktop with room to spare aims at an ultra-HD long edge.
 * A small or busy machine stays near its own pixel ratio.
 */
export function stagePixelRatio(cssWidth: number, cssHeight: number): number {
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const desktop = cssWidth >= 1000 && cssHeight >= 640;
  const high = cores >= 8 && (typeof memory !== "number" || memory >= 8);
  if (desktop && high) {
    const longSide = Math.max(cssWidth, cssHeight, 1);
    return Math.min(3, Math.max(dpr, 3840 / longSide));
  }
  return Math.min(cssWidth < 720 ? 1.5 : 2, Math.max(1, dpr));
}

export function isHello(data: unknown): data is CastHello {
  if (!data || typeof data !== "object") return false;
  const row = data as CastHello;
  return row.kind === "hello" && Number.isFinite(row.w) && Number.isFinite(row.h) && typeof row.host === "boolean";
}

export function isBye(data: unknown): data is CastBye {
  return !!data && typeof data === "object" && (data as CastBye).kind === "bye";
}

export function isTouch(data: unknown): data is CastTouch {
  if (!data || typeof data !== "object") return false;
  const row = data as CastTouch;
  if (row.kind !== "touch" || typeof row.bowlId !== "string" || row.bowlId.length < 1) return false;
  return row.mode === "rim" || row.mode === "gong" || row.mode === "rim-off";
}

export function isRecord(data: unknown): data is CastRecord {
  if (!data || typeof data !== "object") return false;
  const row = data as CastRecord;
  return row.kind === "record" && typeof row.on === "boolean";
}

export function isSnap(data: unknown): data is CastSnap {
  if (!data || typeof data !== "object") return false;
  const row = data as CastSnap;
  return (
    row.kind === "snap" &&
    Array.isArray(row.bowls) &&
    row.bowls.length >= 1 &&
    row.bowls.length <= MAX_BOWLS &&
    Array.isArray(row.ears) &&
    row.ears.length >= 1 &&
    row.ears.length <= MAX_EARS &&
    !!row.settings &&
    !!row.receiver
  );
}

type CastSend = (msg: CastMsg, reliable?: boolean) => void;

export const castBus: {
  role: CastRole | null;
  send: CastSend | null;
} = {
  role: null,
  send: null,
};
