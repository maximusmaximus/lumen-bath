export const GONGS = [
  { id: "felt", label: "Felt", blurb: "Soft and short." },
  { id: "wood", label: "Wood", blurb: "A bright tap." },
  { id: "rubber", label: "Rubber", blurb: "Round and muted." },
  { id: "suede", label: "Suede", blurb: "Slow and warm." },
  { id: "brass", label: "Brass", blurb: "A long ring." },
] as const;

export type GongId = (typeof GONGS)[number]["id"];

const SPECS: Record<GongId, { peak: number; attack: number; decay: number; bright: number; noise: number; q: number }> = {
  felt: { peak: 0.5, attack: 0.012, decay: 0.85, bright: 1600, noise: 0.12, q: 4 },
  wood: { peak: 0.72, attack: 0.004, decay: 0.48, bright: 4800, noise: 0.2, q: 8 },
  rubber: { peak: 0.6, attack: 0.008, decay: 0.7, bright: 2200, noise: 0.08, q: 3 },
  suede: { peak: 0.4, attack: 0.02, decay: 1.5, bright: 1200, noise: 0.06, q: 2.5 },
  brass: { peak: 0.78, attack: 0.003, decay: 2.4, bright: 6800, noise: 0.28, q: 10 },
};

export function isGong(value: unknown): value is GongId {
  return GONGS.some((item) => item.id === value);
}

export function gongSpec(id: GongId) {
  return SPECS[id];
}
