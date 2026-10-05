/** Next turn: the first ear becomes the last stem, and the next stem becomes the ear. */
export function rotateEars<T>(ears: readonly T[]): T[] {
  if (ears.length < 2) return [...ears];
  return [...ears.slice(1), ears[0]!];
}

/** Apply a user-arranged id list. Unknown or missing ids leave the order alone. */
export function reorderEars<T extends { id: string }>(ears: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(ears.map((ear) => [ear.id, ear]));
  const next: T[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const ear = byId.get(id);
    if (!ear || seen.has(id)) continue;
    seen.add(id);
    next.push(ear);
  }
  if (next.length !== ears.length) return [...ears];
  return next;
}

export const CYCLE_MIN = 0.25;
export const CYCLE_MAX = 33.33;

export function clampCycleSeconds(value: number): number {
  if (!Number.isFinite(value)) return CYCLE_MIN;
  const stepped = Math.round(value * 100) / 100;
  return Math.min(CYCLE_MAX, Math.max(CYCLE_MIN, stepped));
}

/** A short fade that finishes before the next stem, so the handoff has no gap and no pile-up. */
export function cycleFadeSeconds(step: number): number {
  const span = clampCycleSeconds(step);
  const fade = Math.min(0.22, Math.max(0.06, span * 0.45));
  return Math.min(fade, span * 0.45);
}
