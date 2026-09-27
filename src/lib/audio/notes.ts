import { MAX_HZ, MIN_HZ, type Bowl, type LoopMode } from "@/lib/audio/types";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function shortNote(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return "—";
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function describePitch(hz: number): { note: string; cents: number; hzLabel: string } {
  if (!Number.isFinite(hz) || hz <= 0) return { note: "—", cents: 0, hzLabel: "—" };
  const midi = 69 + 12 * Math.log2(hz / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const note = cents === 0 ? `${name}${octave}` : `${name}${octave} ${cents > 0 ? "+" : ""}${cents}`;
  const hzLabel = hz >= 100 ? hz.toFixed(1) : hz.toFixed(2);
  return { note, cents, hzLabel };
}

export function unitToHz(unit: number): number {
  const u = Math.min(1, Math.max(0, unit));
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, u);
}

export function hzToUnit(hz: number): number {
  const clamped = Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
  return Math.log(clamped / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
}

export function clampHz(hz: number): number {
  return Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
}

export function periodRange(mode: LoopMode): [number, number] | null {
  switch (mode) {
    case "continuous":
      return null;
    case "breath":
      return [8, 40];
    case "tide":
      return [18, 72];
    case "mallet":
      return [4, 16];
    case "canon":
      return [16, 56];
  }
}

export function nearestBeat(bowl: Bowl, bowls: Bowl[]): number | null {
  let best: number | null = null;
  for (const other of bowls) {
    if (other.id === bowl.id || other.muted || bowl.muted) continue;
    const delta = Math.abs(other.frequency - bowl.frequency);
    if (delta < 7 && (best === null || delta < best)) best = delta;
  }
  return best;
}

export function freestSpot(bowls: { x: number; y: number }[]): { x: number; y: number } {
  let best = { x: 0.42, y: 0.5 };
  let bestD = -1;
  for (let gx = 1; gx <= 7; gx++) {
    for (let gy = 1; gy <= 6; gy++) {
      const x = 0.1 + (gx / 8) * 0.78;
      const y = 0.14 + (gy / 7) * 0.72;
      let min = 4;
      for (const bowl of bowls) {
        min = Math.min(min, Math.hypot(bowl.x - x, (bowl.y - y) * 1.15));
      }
      if (min > bestD) {
        bestD = min;
        best = { x, y };
      }
    }
  }
  return best;
}

export function suggestFrequency(bowls: { frequency: number }[]): number {
  const freqs = bowls.map((bowl) => bowl.frequency).sort((a, b) => a - b);
  const base = freqs[Math.floor(freqs.length / 2)] ?? 196;
  const ratios = [3 / 2, 5 / 4, 4 / 3, 2, 5 / 3, 9 / 8, 15 / 8, 1 / 2, 6 / 5];
  for (const ratio of ratios) {
    let hz = base * ratio;
    while (hz > 880) hz /= 2;
    while (hz < 55) hz *= 2;
    if (freqs.every((freq) => Math.abs(freq - hz) / freq > 0.012)) {
      return Math.round(hz * 100) / 100;
    }
  }
  let hz = base * 1.5;
  while (hz > 880) hz /= 2;
  while (hz < 55) hz *= 2;
  return Math.round(clampHz(hz) * 100) / 100;
}
