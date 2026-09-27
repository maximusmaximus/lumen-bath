import { create } from "zustand";
import { GLASS_IDS } from "@/lib/audio/glass";
import {
  clampHz,
  freestSpot,
  periodRange,
  suggestFrequency,
} from "@/lib/audio/notes";
import {
  DEFAULT_PRESET_ID,
  DEFAULT_SETTINGS,
  getPreset,
  instantiatePreset,
} from "@/lib/audio/presets";
import type { Bowl, Receiver, Settings, Soundscape } from "@/lib/audio/types";
import { MAX_BOWLS, MIN_BOWLS } from "@/lib/audio/types";
import { DEFAULT_RECEIVER, defaultHeight } from "@/lib/audio/space";

const STORAGE_KEY = "lumen-bath-v1";

type Persisted = {
  version: 1;
  presetId: string | null;
  originPresetId: string | null;
  activeName: string | null;
  bowls: Bowl[];
  settings: Settings;
  library: Soundscape[];
  selectedId: string | null;
  receiver: Receiver;
};

type BathState = {
  bowls: Bowl[];
  settings: Settings;
  presetId: string | null;
  originPresetId: string | null;
  activeName: string | null;
  selectedId: string | null;
  library: Soundscape[];
  receiver: Receiver;
  playing: boolean;
  notice: string | null;
  hydrated: boolean;
  select: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  moveReceiver: (x: number, y: number, height?: number) => void;
  updateBowl: (id: string, patch: Partial<Omit<Bowl, "id">>) => void;
  addBowl: () => void;
  removeBowl: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  applyPreset: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  setNotice: (notice: string | null) => void;
  saveSoundscape: (name: string) => void;
  loadSoundscape: (id: string) => void;
  deleteSoundscape: (id: string) => void;
  importLibrary: (items: Soundscape[]) => void;
  hydrate: () => void;
};

const initial = instantiatePreset(DEFAULT_PRESET_ID);

const GLASS_SET = new Set<string>(GLASS_IDS);

function clampPeriod(settings: Settings, patch: Partial<Settings>): Partial<Settings> {
  if (patch.loopMode === undefined && patch.period === undefined) return patch;
  const next = { ...patch };
  const mode = next.loopMode ?? settings.loopMode;
  const range = periodRange(mode);
  if (!range) return next;
  const period = next.period ?? settings.period;
  next.period = Math.min(range[1], Math.max(range[0], period));
  return next;
}

function isBowl(value: unknown): value is Bowl {
  if (!value || typeof value !== "object") return false;
  const bowl = value as Bowl;
  return (
    typeof bowl.id === "string" &&
    typeof bowl.frequency === "number" &&
    typeof bowl.size === "number" &&
    typeof bowl.glass === "string" &&
    GLASS_SET.has(bowl.glass) &&
    typeof bowl.gain === "number" &&
    typeof bowl.x === "number" &&
    typeof bowl.y === "number" &&
    typeof bowl.sing === "number" &&
    typeof bowl.muted === "boolean"
  );
}

function normalizeBowl(bowl: Bowl): Bowl {
  const size = Math.min(1, Math.max(0.36, bowl.size));
  const raw = bowl.height;
  const height =
    typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0.22, raw)) : defaultHeight(size);
  return { ...bowl, size, height };
}

function normalizeReceiver(value: unknown): Receiver {
  if (!value || typeof value !== "object") return { ...DEFAULT_RECEIVER };
  const receiver = value as Receiver;
  if (typeof receiver.x !== "number" || typeof receiver.y !== "number" || typeof receiver.height !== "number") {
    return { ...DEFAULT_RECEIVER };
  }
  return {
    x: Math.min(0.96, Math.max(0.04, receiver.x)),
    y: Math.min(0.96, Math.max(0.04, receiver.y)),
    height: Math.min(1, Math.max(0, receiver.height)),
  };
}

function isSoundscape(value: unknown): value is Soundscape {
  if (!value || typeof value !== "object") return false;
  const item = value as Soundscape;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.updatedAt === "number" &&
    Array.isArray(item.bowls) &&
    item.bowls.every(isBowl) &&
    !!item.settings &&
    typeof item.settings === "object"
  );
}

export const useBath = create<BathState>((set, get) => ({
  bowls: initial.bowls,
  settings: { ...DEFAULT_SETTINGS, ...initial.settingsPatch },
  presetId: initial.preset.id,
  originPresetId: initial.preset.id,
  activeName: null,
  selectedId: initial.bowls[0]?.id ?? null,
  library: [],
  receiver: initial.preset.receiver ? { ...initial.preset.receiver } : { ...DEFAULT_RECEIVER },
  playing: false,
  notice: null,
  hydrated: false,

  select: (id) => set({ selectedId: id }),

  move: (id, x, y) =>
    set((state) => ({
      presetId: null,
      bowls: state.bowls.map((bowl) =>
        bowl.id === id
          ? { ...bowl, x: Math.min(0.94, Math.max(0.06, x)), y: Math.min(0.92, Math.max(0.08, y)) }
          : bowl,
      ),
    })),

  moveReceiver: (x, y, height) =>
    set((state) => ({
      presetId: null,
      receiver: {
        x: Math.min(0.96, Math.max(0.04, x)),
        y: Math.min(0.96, Math.max(0.04, y)),
        height: height === undefined ? state.receiver.height : Math.min(1, Math.max(0, height)),
      },
    })),

  updateBowl: (id, patch) =>
    set((state) => ({
      presetId: null,
      bowls: state.bowls.map((bowl) =>
        bowl.id === id
          ? {
              ...bowl,
              ...patch,
              frequency:
                patch.frequency === undefined ? bowl.frequency : Math.round(clampHz(patch.frequency) * 100) / 100,
              size: patch.size === undefined ? bowl.size : Math.min(1, Math.max(0.36, patch.size)),
              height: patch.height === undefined ? bowl.height : Math.min(1, Math.max(0.22, patch.height)),
              gain: patch.gain === undefined ? bowl.gain : Math.min(1, Math.max(0.05, patch.gain)),
              sing: patch.sing === undefined ? bowl.sing : Math.min(1, Math.max(0, patch.sing)),
            }
          : bowl,
      ),
    })),

  addBowl: () => {
    const { bowls } = get();
    if (bowls.length >= MAX_BOWLS) {
      set({ notice: "Twenty bowls is the ceiling." });
      return;
    }
    const spot = freestSpot(bowls);
    const bowl: Bowl = {
      id: crypto.randomUUID(),
      frequency: suggestFrequency(bowls),
      size: 0.58,
      height: 0.56,
      glass: "quartz",
      gain: 0.72,
      x: spot.x,
      y: spot.y,
      sing: 0.26,
      muted: false,
    };
    set({ bowls: [...bowls, bowl], selectedId: bowl.id, presetId: null, notice: null });
  },

  removeBowl: (id) => {
    const { bowls, selectedId } = get();
    if (bowls.length <= MIN_BOWLS) {
      set({ notice: "Keep at least three bowls in the bath." });
      return;
    }
    const next = bowls.filter((bowl) => bowl.id !== id);
    set({
      bowls: next,
      selectedId: selectedId === id ? (next[0]?.id ?? null) : selectedId,
      presetId: null,
      notice: null,
    });
  },

  setSettings: (patch) =>
    set((state) => {
      const musical = clampPeriod(state.settings, patch);
      const presetTouched = Object.keys(musical).some((key) => key !== "volume" && key !== "awake" && key !== "output");
      return {
        settings: { ...state.settings, ...musical },
        presetId: presetTouched ? null : state.presetId,
      };
    }),

  applyPreset: (id) => {
    const preset = getPreset(id);
    if (!preset) return;
    const next = instantiatePreset(id);
    set({
      bowls: next.bowls,
      settings: { ...get().settings, ...DEFAULT_SETTINGS, ...next.settingsPatch, volume: get().settings.volume, awake: get().settings.awake, output: get().settings.output },
      presetId: preset.id,
      originPresetId: preset.id,
      activeName: null,
      selectedId: next.bowls[0]?.id ?? null,
      receiver: next.preset.receiver ? { ...next.preset.receiver } : { ...DEFAULT_RECEIVER },
      notice: null,
    });
  },

  setPlaying: (playing) => set({ playing }),
  setNotice: (notice) => set({ notice }),

  saveSoundscape: (raw) => {
    const name = raw.trim().slice(0, 48);
    if (!name) {
      set({ notice: "Name the soundscape before saving." });
      return;
    }
    const { bowls, settings, library } = get();
    const existing = library.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const entry: Soundscape = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      updatedAt: Date.now(),
      bowls: bowls.map((bowl) => ({ ...bowl })),
      settings: { ...settings },
      receiver: { ...get().receiver },
    };
    const next = existing
      ? library.map((item) => (item.id === existing.id ? entry : item))
      : [entry, ...library];
    set({ library: next, activeName: name, notice: existing ? `Updated “${name}”.` : `Saved “${name}”.` });
  },

  loadSoundscape: (id) => {
    const item = get().library.find((entry) => entry.id === id);
    if (!item) return;
    set({
      bowls: item.bowls.map((bowl) => normalizeBowl(bowl)),
      settings: { ...DEFAULT_SETTINGS, ...item.settings },
      receiver: normalizeReceiver(item.receiver),
      selectedId: item.bowls[0]?.id ?? null,
      presetId: null,
      originPresetId: null,
      activeName: item.name,
      notice: `Loaded “${item.name}”.`,
    });
  },

  deleteSoundscape: (id) =>
    set((state) => ({
      library: state.library.filter((item) => item.id !== id),
      notice: "Removed from this browser.",
    })),

  importLibrary: (items) =>
    set((state) => {
      const byName = new Map(state.library.map((item) => [item.name.toLowerCase(), item]));
      const next = [...state.library];
      for (const item of items) {
        const key = item.name.toLowerCase();
        const prev = byName.get(key);
        if (prev) {
          const index = next.findIndex((entry) => entry.id === prev.id);
          if (index >= 0) next[index] = { ...item, id: prev.id };
        } else {
          next.unshift(item);
          byName.set(key, item);
        }
      }
      return { library: next, notice: `Imported ${items.length} soundscape${items.length === 1 ? "" : "s"}.` };
    }),

  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.version !== 1 || !Array.isArray(parsed.bowls) || parsed.bowls.length < MIN_BOWLS) {
        set({ hydrated: true });
        return;
      }
      if (!parsed.bowls.every(isBowl)) {
        set({ hydrated: true });
        return;
      }
      const library = Array.isArray(parsed.library) ? parsed.library.filter(isSoundscape) : [];
      set({
        bowls: parsed.bowls.map((bowl) => normalizeBowl(bowl)),
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        presetId: parsed.presetId,
        originPresetId: parsed.originPresetId,
        activeName: parsed.activeName,
        receiver: normalizeReceiver(parsed.receiver),
        selectedId: parsed.selectedId && parsed.bowls.some((bowl) => bowl.id === parsed.selectedId) ? parsed.selectedId : parsed.bowls[0]?.id ?? null,
        library,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));

let persistTimer = 0;
export function bindBathPersistence(): () => void {
  return useBath.subscribe((state) => {
    if (!state.hydrated) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      const snapshot: Persisted = {
        version: 1,
        presetId: state.presetId,
        originPresetId: state.originPresetId,
        activeName: state.activeName,
        bowls: state.bowls,
        settings: state.settings,
        library: state.library,
        selectedId: state.selectedId,
        receiver: state.receiver,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }, 200);
  });
}

export function soundscapeTitle(state: Pick<BathState, "activeName" | "presetId">): string {
  if (state.activeName) return state.activeName;
  return getPreset(state.presetId)?.name ?? "Custom";
}

export function exportPayload(library: Soundscape[]): string {
  return JSON.stringify({ kind: "lumen-bath", version: 1, library }, null, 2);
}

export function parseImport(raw: string): Soundscape[] {
  const parsed = JSON.parse(raw) as { library?: unknown; bowls?: unknown; name?: unknown; settings?: unknown };
  if (Array.isArray(parsed.library)) return parsed.library.filter(isSoundscape);
  if (parsed && Array.isArray(parsed.bowls) && typeof parsed.name === "string") {
    const single = {
      id: crypto.randomUUID(),
      name: parsed.name,
      updatedAt: Date.now(),
      bowls: parsed.bowls,
      settings: parsed.settings,
    };
    return isSoundscape(single) ? [single] : [];
  }
  return [];
}
