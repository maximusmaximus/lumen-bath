import { listPresetStats, recordPresetPick, recordPresetPlay, recordPresetSave, recordPresetVote } from "@/lib/community/api";
import type { PresetStat } from "@/lib/community/types";

const PLAY = "lumen-preset-play-";
const SAVE = "lumen-preset-save-";
const VOTE = "lumen-preset-vote-";

function once(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

/** Count a listen of a built-in preset once per browser session. */
export function notePresetPlay(id: string | null | undefined) {
  if (!id || !once(`${PLAY}${id}`)) return;
  void recordPresetPlay({ data: id }).catch(() => undefined);
}

/** One thumb per preset per browser. A later opposite thumb moves the vote. */
export function notePresetVote(id: string | null | undefined, vote: "up" | "down") {
  if (!id) return;
  let previous: "up" | "down" | null = null;
  try {
    const stored = sessionStorage.getItem(`${VOTE}${id}`);
    if (stored === "up" || stored === "down") previous = stored;
    if (previous === vote) return;
    sessionStorage.setItem(`${VOTE}${id}`, vote);
  } catch {
    /* still send the vote */
  }
  void recordPresetVote({ data: { id, vote, previous } }).catch(() => undefined);
  void recordPresetPick({ data: { id, kind: vote === "up" ? "up" : "down" } }).catch(() => undefined);
}
export function notePresetSave(id: string | null | undefined, ears: number) {
  if (!id || !once(`${SAVE}${id}`)) return;
  void recordPresetSave({ data: { id, stems: ears > 1 } }).catch(() => undefined);
}

export function notePresetOpen(id: string | null | undefined) {
  if (!id) return;
  void recordPresetPick({ data: { id, kind: "open" } }).catch(() => undefined);
}

export function notePresetTag(tag: string) {
  const clean = tag.trim();
  if (!clean) return;
  void recordPresetPick({ data: { id: null, tag: clean, kind: "tag" } }).catch(() => undefined);
}

export async function loadPresetStats(): Promise<Record<string, PresetStat>> {
  const rows = await listPresetStats();
  const map: Record<string, PresetStat> = {};
  for (const row of rows) map[row.id] = row;
  return map;
}
