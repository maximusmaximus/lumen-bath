import { create } from "zustand";
import { GLASS_IDS } from "@/lib/audio/glass";
import { isGong } from "@/lib/audio/gong";
import {
  clampHz,
  periodRange,
  suggestFrequency,
} from "@/lib/audio/notes";
import {
  DEFAULT_PRESET_ID,
  DEFAULT_SETTINGS,
  getPreset,
  instantiatePreset,
} from "@/lib/audio/presets";
import type { CommunityTemplate } from "@/lib/community/types";
import { roomPatch, getRoom } from "@/lib/audio/rooms";
import { DEFAULT_RECEIVER, clampEarHeight, clampRoomLayout, clampSide, clampSpot, containEar, defaultHeight, earPitch, earSide, earSolids, facingYaw, limitBowl, makeEar, moveBowl, openSpot, receiverPoint, separateBowls, wrapAngle, DEFAULT_LEFT, DEFAULT_RIGHT } from "@/lib/audio/space";
import { clampCycleSeconds, cycleFadeSeconds, reorderEars, rotateEars } from "@/lib/audio/ear-order";
import { clampDome, freshDome } from "@/lib/audio/dome";
import type { Bowl, Dome, Ear, EarSide, Receiver, RoomShapeId, Settings, Soundscape } from "@/lib/audio/types";
import { MAX_BOWLS, MAX_DOMES, MAX_EARS, MIN_BOWLS } from "@/lib/audio/types";

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
  ears: Ear[];
  domes?: Dome[];
  activeEarId: string;
  focus: "bowl" | "ear" | "dome";
  sourceTemplateId: string | null;
  shareRef?: { userSlug: string; slug: string } | null;
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
  ears: Ear[];
  domes: Dome[];
  activeEarId: string;
  focus: "bowl" | "ear" | "dome";
  sourceTemplateId: string | null;
  shareRef: { userSlug: string; slug: string } | null;
  /** The loaded preset or fan bath has been edited, so it can be saved as a new one. */
  changed: boolean;
  /** Bumps when a preset or fan bath is loaded, so that load is not treated as an edit. */
  loadStamp: number;
  /** Main ear is waiting to become a stem. The next stem you pick is a preview of the ear. */
  handoff: boolean;
  /** Stem currently heard as the ear, before it is kept. */
  previewEarId: string | null;
  /** Walk the heard ear through the arranged order. */
  cycleThrough: boolean;
  /** Seconds you hear one stem before the quick fade to the next. */
  cycleSeconds: number;
  /** Visual glide while the ear fades to the next stem. `ms` is that fade. */
  cycleFlight: { x: number; y: number; z: number; yaw: number; until: number; leaveId: string; ms: number } | null;
  playing: boolean;
  notice: string | null;
  hydrated: boolean;
  selection: string[];
  select: (id: string, additive?: boolean) => void;
  selectEar: (id: string, additive?: boolean) => void;
  promoteEar: (id: string) => void;
  makeStem: () => void;
  orderEars: (ids: string[]) => void;
  cycleEars: () => void;
  setCycle: (patch: { on?: boolean; seconds?: number }) => void;
  move: (id: string, x: number, y: number) => void;
  moveReceiver: (x: number, y: number, height?: number, earId?: string) => void;
  turnReceiver: (yaw: number, earId?: string) => void;
  tiltReceiver: (pitch: number, earId?: string) => void;
  updateEarSide: (id: string, side: "left" | "right", patch: Partial<EarSide>) => void;
  setBothSides: (id: string, left: Partial<EarSide>, right: Partial<EarSide>) => void;
  setEarSpread: (id: string, meters: number) => void;
  addEar: () => void;
  removeEar: (id: string) => void;
  duplicateEar: (id: string) => void;
  setRoom: (id: RoomShapeId) => void;
  updateBowl: (id: string, patch: Partial<Omit<Bowl, "id">>) => void;
  setBowlSpan: (id: string, height: number, gain: number) => void;
  addBowl: () => void;
  removeBowl: (id: string) => void;
  duplicateBowl: (id: string) => void;
  addDome: () => void;
  updateDome: (id: string, patch: Partial<Omit<Dome, "id">>) => void;
  moveDome: (id: string, x: number, y: number) => void;
  removeDome: (id: string) => void;
  duplicateDome: (id: string) => void;
  selectDome: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  applyPreset: (id: string, options?: { history?: boolean }) => void;
  placeGroup: (patch: { bowls?: { id: string; x: number; y: number }[]; ears?: { id: string; x: number; y: number }[] }) => void;
  scaleGroup: (patch: { bowls?: { id: string; size: number }[]; cones?: { id: string; left: number; right: number }[] }) => void;
  turnGroup: (turns: { id: string; yaw: number }[]) => void;
  nudgeSelection: (dx: number, dy: number) => void;
  setPlaying: (playing: boolean) => void;
  setNotice: (notice: string | null) => void;
  applyCast: (snap: {
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
    playing: boolean;
    previewEarId?: string | null;
    cycleThrough?: boolean;
    cycleSeconds?: number;
    domes?: Dome[];
  }) => void;
  saveSoundscape: (name: string) => void;
  loadSoundscape: (id: string) => void;
  deleteSoundscape: (id: string) => void;
  importLibrary: (items: Soundscape[]) => void;
  stampShare: (stamp: {
    userSlug: string;
    slug: string;
    templateId: string;
    name: string;
    savedId?: string | null;
    bindLive: boolean;
  }) => void;
  loadPublished: (template: CommunityTemplate) => void;
  hydrate: () => boolean;
};

function beside(
  x: number,
  y: number,
  settings: Settings,
  bowls: Bowl[],
  pad: number,
): { x: number; y: number } {
  const tries: [number, number][] = [
    [0.1, 0.07],
    [-0.1, 0.07],
    [0.1, -0.07],
    [-0.12, -0.1],
  ];
  for (const [dx, dy] of tries) {
    const spot = clampSpot(x + dx, y + dy, settings, bowls, pad);
    if (Math.hypot(spot.x - x, spot.y - y) > 0.035) return spot;
  }
  return clampSpot(x + 0.1, y + 0.07, settings, bowls, pad);
}

const initial = instantiatePreset(DEFAULT_PRESET_ID);
const openingEars = initial.ears.length ? initial.ears : [makeEar(DEFAULT_RECEIVER, "ear-1")];

type Spatial = {
  bowls: Bowl[];
  ears: Ear[];
  receiver: Receiver;
  selectedId: string | null;
  activeEarId: string;
  focus: "bowl" | "ear" | "dome";
  selection: string[];
  settings: Settings;
  domes: Dome[];
};

const undoStack: Spatial[] = [];
const redoStack: Spatial[] = [];
let holdUntil = 0;

function cloneEar(ear: Ear): Ear {
  return { ...ear, left: { ...ear.left }, right: { ...ear.right } };
}

function snapshot(state: Spatial): Spatial {
  return {
    bowls: state.bowls.map((bowl) => ({ ...bowl })),
    ears: state.ears.map(cloneEar),
    domes: state.domes.map((dome) => ({ ...dome })),
    receiver: { ...state.receiver },
    selectedId: state.selectedId,
    activeEarId: state.activeEarId,
    focus: state.focus,
    selection: [...state.selection],
    settings: { ...state.settings },
  };
}

function stamp(state: Spatial) {
  const now = Date.now();
  if (now < holdUntil) return;
  holdUntil = now + 520;
  undoStack.push(snapshot(state));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}

function restore(entry: Spatial) {
  holdUntil = 0;
  useBath.setState({
    bowls: entry.bowls,
    ears: entry.ears,
    domes: entry.domes,
    receiver: entry.receiver,
    selectedId: entry.selectedId,
    activeEarId: entry.activeEarId,
    focus: entry.focus,
    selection: entry.selection,
    settings: entry.settings,
    presetId: null,
    handoff: false,
    previewEarId: null,
  });
}

export function undoBath(): boolean {
  const prev = undoStack.pop();
  if (!prev) {
    useBath.getState().setNotice("Nothing to undo.");
    return false;
  }
  redoStack.push(snapshot(useBath.getState()));
  restore(prev);
  useBath.getState().setNotice("Moved back.");
  return true;
}

export function redoBath(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(snapshot(useBath.getState()));
  restore(next);
  useBath.getState().setNotice("Moved forward.");
  return true;
}

function toggleKey(current: string[], key: string, additive: boolean): string[] {
  if (!additive) return [key];
  if (current.includes(key)) {
    const next = current.filter((item) => item !== key);
    return next.length ? next : [key];
  }
  return [...current, key];
}

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

function isDome(value: unknown): value is Dome {
  if (!value || typeof value !== "object") return false;
  const dome = value as Dome;
  return (
    typeof dome.id === "string" &&
    typeof dome.x === "number" &&
    typeof dome.y === "number" &&
    typeof dome.size === "number" &&
    typeof dome.height === "number" &&
    typeof dome.frequency === "number" &&
    typeof dome.glass === "string" &&
    GLASS_SET.has(dome.glass)
  );
}

function normalizeBowl(bowl: Bowl): Bowl {
  const size = Math.min(1, Math.max(0.36, bowl.size));
  const raw = bowl.height;
  const height =
    typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0.22, raw)) : defaultHeight(size);
  return { ...bowl, size, height, gong: isGong(bowl.gong) ? bowl.gong : undefined };
}

function poseOf(ear: Ear): Receiver {
  return { x: ear.x, y: ear.y, height: ear.height, yaw: ear.yaw, pitch: earPitch(ear) };
}

function normalizeEar(value: unknown, fallbackId: string): Ear | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Ear>;
  if (typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.height !== "number") return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : fallbackId,
    x: Math.min(3, Math.max(-2, raw.x)),
    y: Math.min(3, Math.max(-2, raw.y)),
    height: clampEarHeight(raw.height),
    yaw: wrapAngle(typeof raw.yaw === "number" ? raw.yaw : 0),
    pitch: earPitch(raw),
    left: earSide(raw.left, DEFAULT_LEFT),
    right: earSide(raw.right, DEFAULT_RIGHT),
  };
}

function earsFrom(receiver: unknown, ears: unknown): { ears: Ear[]; activeEarId: string } {
  const list = Array.isArray(ears)
    ? ears
        .map((item, index) => normalizeEar(item, `ear-${index + 1}`))
        .filter((item): item is Ear => item !== null)
        .slice(0, MAX_EARS)
    : [];
  const ready = list.length > 0 ? list : [makeEar(normalizeReceiver(receiver), "ear-1")];
  return { ears: ready, activeEarId: ready[0]!.id };
}

function normalizeReceiver(value: unknown): Receiver {
  if (!value || typeof value !== "object") return { ...DEFAULT_RECEIVER };
  const receiver = value as Receiver;
  if (typeof receiver.x !== "number" || typeof receiver.y !== "number" || typeof receiver.height !== "number") {
    return { ...DEFAULT_RECEIVER };
  }
  return {
    x: Math.min(3, Math.max(-2, receiver.x)),
    y: Math.min(3, Math.max(-2, receiver.y)),
    height: clampEarHeight(receiver.height),
    yaw: wrapAngle(typeof receiver.yaw === "number" ? receiver.yaw : 0),
    pitch: earPitch(receiver),
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

function savedShare(item: Soundscape): NonNullable<Soundscape["share"]> | null {
  const share = item.share;
  if (!share) return null;
  if (!share.userSlug || !share.slug || !share.templateId) return null;
  return share;
}

export const useBath = create<BathState>((set, get) => ({
  bowls: initial.bowls,
  settings: { ...DEFAULT_SETTINGS, ...initial.settingsPatch },
  presetId: initial.preset.id,
  originPresetId: initial.preset.id,
  activeName: null,
  selectedId: initial.bowls[0]?.id ?? null,
  library: [],
  receiver: poseOf(openingEars[0]!),
  ears: openingEars,
  domes: [],
  activeEarId: openingEars[0]!.id,
  focus: "bowl" as const,
  sourceTemplateId: null,
  shareRef: null,
  changed: false,
  loadStamp: 0,
  handoff: false,
  previewEarId: null,
  cycleThrough: false,
  cycleSeconds: 0.25,
  cycleFlight: null,
  playing: false,
  notice: null,
  hydrated: false,
  selection: initial.bowls[0] ? [`b:${initial.bowls[0].id}`] : [],

  select: (id, additive = false) =>
    set((state) => {
      const key = `b:${id}`;
      if (!additive && state.selection.includes(key)) {
        return { selectedId: id, focus: "bowl" as const, selection: state.selection };
      }
      const selection = toggleKey(state.selection, key, additive);
      const on = selection.includes(key);
      return {
        selectedId: on ? id : (selection.find((item) => item.startsWith("b:"))?.slice(2) ?? state.selectedId),
        focus: on ? "bowl" as const : state.focus,
        selection,
      };
    }),

  selectEar: (id, additive = false) =>
    set((state) => {
      const ear = state.ears.find((item) => item.id === id) ?? state.ears[0];
      if (!ear) return state;
      const key = `e:${ear.id}`;
      const primaryId = state.ears[0]?.id;
      const preview = (): { previewEarId: string | null; notice: string | null } => {
        if (!state.handoff) return { previewEarId: null, notice: state.notice };
        if (ear.id === primaryId) {
          return state.previewEarId
            ? { previewEarId: null, notice: "Select a stem to hear it as the ear. This one stays until you do." }
            : { previewEarId: null, notice: state.notice };
        }
        if (state.previewEarId === ear.id) return { previewEarId: ear.id, notice: state.notice };
        return {
          previewEarId: ear.id,
          notice: "Previewing this stem as the ear. The two mix. Press the ear icon to keep it.",
        };
      };
      if (!additive && state.selection.includes(key)) {
        return { activeEarId: ear.id, focus: "ear" as const, receiver: poseOf(ear), selection: state.selection, ...preview() };
      }
      const selection = toggleKey(state.selection, key, additive);
      const on = selection.includes(key);
      const heard = on && !additive ? preview() : { previewEarId: state.handoff ? state.previewEarId : null, notice: state.notice };
      return {
        activeEarId: on ? ear.id : state.activeEarId,
        focus: on ? ("ear" as const) : state.focus,
        receiver: on ? poseOf(ear) : state.receiver,
        selection,
        ...heard,
      };
    }),

  promoteEar: (id) =>
    set((state) => {
      const index = state.ears.findIndex((ear) => ear.id === id);
      if (index < 0) return state;
      if (index === 0) return { notice: "This is already the ear you hear." };
      stamp(state);
      const ears = state.ears.slice();
      const previous = ears[0]!;
      ears[0] = ears[index]!;
      ears[index] = previous;
      const ear = ears[0]!;
      return {
        ears,
        activeEarId: ear.id,
        focus: "ear" as const,
        receiver: poseOf(ear),
        selection: [`e:${ear.id}`],
        previewEarId: null,
        handoff: false,
        presetId: null,
        notice: "This is the ear you hear. The other pair is a stem. They mix as they trade places.",
      };
    }),

  makeStem: () =>
    set((state) => {
      const primary = state.ears[0];
      if (!primary) return state;
      if (state.ears.length < 2) {
        return { notice: "Add another ear first. One has to stay the ear you hear." };
      }
      if (state.handoff) {
        return { handoff: false, previewEarId: null, notice: "Still hearing this ear." };
      }
      if (state.activeEarId !== primary.id) {
        return { notice: "Select the ear you hear, then turn it into a stem." };
      }
      return {
        handoff: true,
        previewEarId: null,
        focus: "ear" as const,
        activeEarId: primary.id,
        selection: [`e:${primary.id}`],
        receiver: poseOf(primary),
        notice: "Select another ear. You'll hear it as a preview of the main source, mixed with this one.",
      };
    }),

  orderEars: (ids) =>
    set((state) => {
      const ears = reorderEars(state.ears, ids);
      if (ears.every((ear, index) => ear.id === state.ears[index]?.id)) return state;
      stamp(state);
      const ear = ears[0]!;
      const firstChanged = ear.id !== state.ears[0]?.id;
      return {
        ears,
        presetId: null,
        activeEarId: firstChanged ? ear.id : state.activeEarId,
        receiver: firstChanged ? poseOf(ear) : state.receiver,
        selection: firstChanged ? [`e:${ear.id}`] : state.selection,
        focus: firstChanged ? ("ear" as const) : state.focus,
        previewEarId: firstChanged ? null : state.previewEarId,
        handoff: firstChanged ? false : state.handoff,
        notice: firstChanged ? "This one is the ear you hear. The list is the order they cycle." : null,
      };
    }),

  cycleEars: () =>
    set((state) => {
      if (state.ears.length < 2) return state;
      const previous = state.ears[0]!;
      const from = receiverPoint(previous, state.settings);
      const ears = rotateEars(state.ears);
      const ear = ears[0]!;
      const ms = Math.round(cycleFadeSeconds(state.cycleSeconds) * 1000);
      return {
        ears,
        activeEarId: ear.id,
        receiver: poseOf(ear),
        selection: state.focus === "ear" ? [`e:${ear.id}`] : state.selection,
        previewEarId: null,
        handoff: false,
        cycleFlight: {
          x: from.x,
          y: from.y,
          z: from.z,
          yaw: facingYaw(previous, state.settings),
          until: Date.now() + ms,
          leaveId: previous.id,
          ms,
        },
      };
    }),

  setCycle: (patch) =>
    set((state) => {
      const seconds = patch.seconds === undefined ? state.cycleSeconds : clampCycleSeconds(patch.seconds);
      if (patch.on === undefined) return { cycleSeconds: seconds };
      if (patch.on && state.ears.length < 2) {
        return { cycleThrough: false, cycleSeconds: seconds, notice: "Add a stem. Cycle walks the ear through each one." };
      }
      return {
        cycleThrough: patch.on,
        cycleSeconds: seconds,
        notice: patch.on ? "Cycling. You hear one stem, then a short fade into the next, and it loops." : null,
      };
    }),

  moveReceiver: (x, y, height, earId) =>
    set((state) => {
      stamp(state);
      const id = earId ?? state.activeEarId;
      const spot = clampSpot(x, y, state.settings, state.bowls, 0.2);
      const ears = state.ears.map((ear) =>
        ear.id === id
          ? {
              ...ear,
              x: spot.x,
              y: spot.y,
              height: height === undefined ? ear.height : clampEarHeight(height),
            }
          : ear,
      );
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { presetId: null, ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  turnReceiver: (yaw, earId) =>
    set((state) => {
      stamp(state);
      const id = earId ?? state.activeEarId;
      const ears = state.ears.map((ear) => (ear.id === id ? { ...ear, yaw: wrapAngle(yaw) } : ear));
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  tiltReceiver: (pitch, earId) =>
    set((state) => {
      stamp(state);
      const id = earId ?? state.activeEarId;
      const ears = state.ears.map((ear) => (ear.id === id ? { ...ear, pitch: earPitch({ pitch }) } : ear));
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  updateEarSide: (id, side, patch) =>
    set((state) => {
      stamp(state);
      return {
      presetId: null,
      ears: state.ears.map((ear) =>
        ear.id === id ? { ...ear, [side]: clampSide({ ...ear[side], ...patch }) } : ear,
      ),
    };
    }),

  setBothSides: (id, left, right) =>
    set((state) => {
      stamp(state);
      return {
        presetId: null,
        ears: state.ears.map((ear) =>
          ear.id === id
            ? {
                ...ear,
                left: clampSide({ ...ear.left, ...left }),
                right: clampSide({ ...ear.right, ...right }),
              }
            : ear,
        ),
      };
    }),

  setEarSpread: (id, meters) =>
    set((state) => {
      stamp(state);
      const spread = Math.min(0.38, Math.max(0.04, meters));
      return {
        presetId: null,
        ears: state.ears.map((ear) =>
          ear.id === id
            ? {
                ...ear,
                left: clampSide({ ...ear.left, x: -spread }),
                right: clampSide({ ...ear.right, x: spread }),
              }
            : ear,
        ),
      };
    }),

  addEar: () =>
    set((state) => {
      stamp(state);
      if (state.ears.length >= MAX_EARS) {
        return { notice: "Eight ears is the ceiling." };
      }
      const current = state.ears.find((ear) => ear.id === state.activeEarId) ?? state.ears[0];
      if (!current) return state;
      const spot = beside(current.x, current.y, state.settings, state.bowls, 0.2);
      const ear = makeEar(
        {
          x: spot.x,
          y: spot.y,
          height: current.height,
          yaw: current.yaw,
        },
        crypto.randomUUID(),
      );
      return {
        ears: [...state.ears, ear],
        activeEarId: ear.id,
        focus: "ear",
        selection: [`e:${ear.id}`],
        receiver: poseOf(ear),
        presetId: null,
        notice:
          state.ears.length === 0
            ? null
            : "Added a stem. You still hear the first ear. Extra ears are saved as their own left and right when you record.",
      };
    }),

  removeEar: (id) =>
    set((state) => {
      if (state.ears.length <= 1) {
        return { notice: "Keep at least one ear." };
      }
      stamp(state);
      const ears = state.ears.filter((ear) => ear.id !== id);
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0]!;
      const selection = state.selection.filter((key) => key !== `e:${id}`);
      const removedPrimary = state.ears[0]?.id === id;
      return {
        ears,
        activeEarId: active.id,
        focus: state.focus === "ear" ? "ear" : state.focus,
        receiver: poseOf(active),
        selection: selection.length ? selection : [`e:${active.id}`],
        presetId: null,
        handoff: !removedPrimary && ears.length > 1 && state.handoff,
        previewEarId: removedPrimary || state.previewEarId === id ? null : state.previewEarId,
        notice: removedPrimary ? "You hear the next ear now. The mix crosses over." : null,
      };
    }),

  duplicateEar: (id) =>
    set((state) => {
      if (state.ears.length >= MAX_EARS) return { notice: "Eight ears is the ceiling." };
      const source = state.ears.find((ear) => ear.id === id);
      if (!source) return state;
      stamp(state);
      const spot = beside(source.x, source.y, state.settings, state.bowls, 0.2);
      const ear = makeEar(
        { x: spot.x, y: spot.y, height: source.height, yaw: source.yaw },
        crypto.randomUUID(),
        { ...source.left },
        { ...source.right },
      );
      const primary = state.ears[0]?.id === source.id;
      return {
        ears: [...state.ears, ear],
        activeEarId: ear.id,
        focus: "ear",
        selection: [`e:${ear.id}`],
        receiver: poseOf(ear),
        presetId: null,
        notice: primary
          ? "Copied beside it as a stem. You still hear Ear 1. Nothing else moved."
          : "Copied beside it. Nothing else moved.",
      };
    }),

  move: (id, x, y) =>
    set((state) => {
      const current = state.bowls.find((bowl) => bowl.id === id);
      if (!current) return state;
      stamp(state);
      const others = state.bowls.filter((bowl) => bowl.id !== id);
      const spot = moveBowl(current, x, y, others, state.settings, earSolids(state.ears, state.settings));
      return {
        presetId: null,
        bowls: state.bowls.map((bowl) => (bowl.id === id ? { ...bowl, x: spot.x, y: spot.y } : bowl)),
      };
    }),

  setRoom: (id) =>
    set((state) => {
      stamp(state);
      const current = getRoom(state.settings.roomShape);
      const patch = roomPatch(id);
      const settings = {
        ...state.settings,
        roomShape: patch.roomShape,
        decay: patch.decay,
        early: patch.early,
        diffusion: patch.diffusion,
        absorption: patch.absorption,
        flutter: patch.flutter,
        modes: patch.modes,
        airLoss: patch.airLoss,
        slap: patch.slap,
        bloom: patch.bloom,
        space: patch.space,
        layoutSpanX: state.settings.layoutSpanX ?? current.spanX,
        layoutSpanZ: state.settings.layoutSpanZ ?? current.spanZ,
      };
      return { presetId: null, settings, bowls: state.bowls };
    }),

  updateBowl: (id, patch) =>
    set((state) => {
      const current = state.bowls.find((bowl) => bowl.id === id);
      if (!current) return state;
      stamp(state);
      const others = state.bowls.filter((bowl) => bowl.id !== id);
      let next: Bowl = {
        ...current,
        ...patch,
        frequency: patch.frequency === undefined ? current.frequency : Math.round(clampHz(patch.frequency) * 100) / 100,
        size: patch.size === undefined ? current.size : Math.min(1, Math.max(0.36, patch.size)),
        height: patch.height === undefined ? current.height : Math.min(1, Math.max(0.22, patch.height)),
        gain: patch.gain === undefined ? current.gain : Math.min(1, Math.max(0.05, patch.gain)),
        sing: patch.sing === undefined ? current.sing : Math.min(1, Math.max(0, patch.sing)),
      };
      const blocks = earSolids(state.ears, state.settings);
      if (patch.size !== undefined) next = { ...next, size: limitBowl(current, "size", next.size, 0.36, 1, others, state.settings, blocks) };
      if (patch.height !== undefined) {
        next = { ...next, height: limitBowl({ ...current, size: next.size }, "height", next.height, 0.22, 1, others, state.settings, blocks) };
      }
      if (patch.gain !== undefined) {
        next = {
          ...next,
          gain: limitBowl({ ...current, size: next.size, height: next.height }, "gain", next.gain, 0.05, 1, others, state.settings, blocks),
        };
      }
      if (patch.x !== undefined || patch.y !== undefined) {
        const spot = moveBowl(next, next.x, next.y, others, state.settings, blocks);
        next = { ...next, ...spot };
      }
      return {
        presetId: null,
        bowls: state.bowls.map((bowl) => (bowl.id === id ? next : bowl)),
        settings:
          patch.gong !== undefined
            ? {
                ...state.settings,
                gongs: state.bowls.map((bowl) => (bowl.id === id ? (next.gong ?? null) : (bowl.gong ?? null))),
              }
            : state.settings,
      };
    }),

  setBowlSpan: (id, height, gain) =>
    set((state) => {
      const current = state.bowls.find((bowl) => bowl.id === id);
      if (!current) return state;
      const nextHeight = Math.min(1, Math.max(0.22, height));
      const nextGain = Math.min(1, Math.max(0.05, gain));
      if (Math.abs(nextHeight - current.height) < 1e-4 && Math.abs(nextGain - current.gain) < 1e-4) return state;
      stamp(state);
      return {
        presetId: null,
        bowls: state.bowls.map((bowl) => (bowl.id === id ? { ...bowl, height: nextHeight, gain: nextGain } : bowl)),
      };
    }),

  addBowl: () => {
    const { bowls, settings } = get();
    if (bowls.length >= MAX_BOWLS) {
      set({ notice: "Twenty bowls is the ceiling." });
      return;
    }
    const proto = {
      id: "new",
      x: 0.5,
      y: 0.5,
      size: 0.58,
      height: 0.56,
      gain: 0.72,
    };
    const spot = openSpot(bowls, settings, proto);
    const bowl: Bowl = {
      id: crypto.randomUUID(),
      frequency: suggestFrequency(bowls),
      size: proto.size,
      height: proto.height,
      glass: "quartz",
      gain: proto.gain,
      x: spot.x,
      y: spot.y,
      sing: 0.26,
      muted: false,
    };
    stamp(get());
    set({ bowls: [...bowls, bowl], selectedId: bowl.id, selection: [`b:${bowl.id}`], focus: "bowl", presetId: null, notice: null });
  },

  removeBowl: (id) => {
    const { bowls, selectedId } = get();
    if (bowls.length <= MIN_BOWLS) {
      set({ notice: "Keep at least three bowls in the bath." });
      return;
    }
    stamp(get());
    const next = bowls.filter((bowl) => bowl.id !== id);
    const selection = get().selection.filter((key) => key !== `b:${id}`);
    set({
      bowls: next,
      selectedId: selectedId === id ? (next[0]?.id ?? null) : selectedId,
      selection: selection.length ? selection : next[0] ? [`b:${next[0].id}`] : [],
      presetId: null,
      notice: null,
    });
  },

  duplicateBowl: (id) => {
    const { bowls, settings } = get();
    if (bowls.length >= MAX_BOWLS) {
      set({ notice: "Twenty bowls is the ceiling." });
      return;
    }
    const source = bowls.find((bowl) => bowl.id === id);
    if (!source) return;
    stamp(get());
    const pad = 0.26 + Math.min(1, Math.max(0.36, source.size)) * 0.92;
    const spot = beside(source.x, source.y, settings, bowls, pad);
    const draft = { ...source, id: crypto.randomUUID(), x: spot.x, y: spot.y };
    const placed = moveBowl(draft, draft.x, draft.y, bowls, settings, earSolids(get().ears, settings));
    const bowl = { ...draft, ...placed };
    set({
      bowls: [...bowls, bowl],
      selectedId: bowl.id,
      selection: [`b:${bowl.id}`],
      focus: "bowl",
      presetId: null,
      notice: "Copied beside it. Nothing else moved.",
    });
  },

  selectDome: (id) =>
    set((state) => {
      if (!state.domes.some((dome) => dome.id === id)) return state;
      return { selectedId: id, focus: "dome", selection: [`d:${id}`], notice: null };
    }),

  addDome: () => {
    const { domes } = get();
    if (domes.length >= MAX_DOMES) {
      set({ notice: "Four domes is the ceiling." });
      return;
    }
    const spot = beside(0.5, 0.46, get().settings, get().bowls, 0.2);
    const dome = freshDome({ id: crypto.randomUUID(), x: spot.x, y: spot.y, frequency: suggestFrequency(get().bowls) });
    stamp(get());
    set({
      domes: [...domes, dome],
      selectedId: dome.id,
      selection: [`d:${dome.id}`],
      focus: "dome",
      presetId: null,
      notice: "A dome hangs face-down. Waves that rise into it come back down.",
    });
  },

  updateDome: (id, patch) =>
    set((state) => {
      const current = state.domes.find((dome) => dome.id === id);
      if (!current) return state;
      stamp(state);
      return {
        presetId: null,
        domes: state.domes.map((dome) => (dome.id === id ? clampDome({ ...dome, ...patch, id: dome.id }) : dome)),
      };
    }),

  moveDome: (id, x, y) =>
    set((state) => {
      const current = state.domes.find((dome) => dome.id === id);
      if (!current) return state;
      const spot = clampSpot(x, y, state.settings, state.bowls, 0.12 + current.size * 0.08);
      if (Math.abs(spot.x - current.x) < 1e-4 && Math.abs(spot.y - current.y) < 1e-4) return state;
      stamp(state);
      return {
        presetId: null,
        domes: state.domes.map((dome) => (dome.id === id ? { ...dome, ...spot } : dome)),
      };
    }),

  removeDome: (id) => {
    const { domes, selectedId } = get();
    stamp(get());
    const next = domes.filter((dome) => dome.id !== id);
    const bowl = get().bowls[0];
    set({
      domes: next,
      selectedId: selectedId === id ? (next[0]?.id ?? bowl?.id ?? null) : selectedId,
      focus: selectedId === id ? (next[0] ? "dome" : "bowl") : get().focus,
      selection: selectedId === id ? (next[0] ? [`d:${next[0].id}`] : bowl ? [`b:${bowl.id}`] : []) : get().selection.filter((key) => key !== `d:${id}`),
      presetId: null,
      notice: null,
    });
  },

  duplicateDome: (id) => {
    const { domes, settings, bowls } = get();
    if (domes.length >= MAX_DOMES) {
      set({ notice: "Four domes is the ceiling." });
      return;
    }
    const source = domes.find((dome) => dome.id === id);
    if (!source) return;
    stamp(get());
    const spot = beside(source.x, source.y, settings, bowls, 0.16 + source.size * 0.12);
    const dome = clampDome({ ...source, id: crypto.randomUUID(), x: spot.x, y: spot.y });
    set({
      domes: [...domes, dome],
      selectedId: dome.id,
      selection: [`d:${dome.id}`],
      focus: "dome",
      presetId: null,
      notice: "Copied beside it. Nothing else moved.",
    });
  },

  setSettings: (patch) =>
    set((state) => {
      const musical = clampPeriod(state.settings, patch);
      let settings = { ...state.settings, ...musical };
      const geometry = patch.width !== undefined || patch.depth !== undefined || patch.size !== undefined || patch.roomShape !== undefined;
      if (geometry) {
        stamp(state);
        settings = clampRoomLayout(state.settings, settings, state.bowls);
      }
      const presetTouched = Object.keys(musical).some((key) => key !== "volume" && key !== "awake" && key !== "output");
      return {
        settings,
        bowls: state.bowls,
        presetId: presetTouched ? null : state.presetId,
      };
    }),

  applyPreset: (id, options) => {
    const preset = getPreset(id);
    if (!preset) return;
    const next = instantiatePreset(id);
    const settings = { ...get().settings, ...DEFAULT_SETTINGS, ...next.settingsPatch, volume: get().settings.volume, awake: get().settings.awake, output: get().settings.output, layoutSpanX: undefined, layoutSpanZ: undefined };
    const ears = next.ears.length ? next.ears : [makeEar(next.preset.receiver ?? DEFAULT_RECEIVER, "ear-1")];
    const ear = ears[0]!;
    if (options?.history !== false) stamp(get());
    set({
      bowls: separateBowls(next.bowls, settings),
      settings,
      presetId: preset.id,
      originPresetId: preset.id,
      activeName: null,
      selectedId: next.bowls[0]?.id ?? null,
      selection: next.bowls[0] ? [`b:${next.bowls[0].id}`] : [],
      ears,
      domes: next.domes,
      activeEarId: ear.id,
      focus: "bowl",
      receiver: poseOf(ear),
      sourceTemplateId: null,
      shareRef: null,
      changed: false,
      loadStamp: Date.now(),
      handoff: false,
      previewEarId: null,
      notice: null,
      cycleThrough: Boolean(preset.cycle?.on && ears.length >= 2),
      cycleSeconds: preset.cycle ? clampCycleSeconds(preset.cycle.seconds) : get().cycleSeconds,
    });
  },

  placeGroup: (patch) =>
    set((state) => {
      stamp(state);
      const bowlMoves = new Map((patch.bowls ?? []).map((item) => [item.id, item]));
      const earMoves = new Map((patch.ears ?? []).map((item) => [item.id, item]));
      let bowls = state.bowls.map((bowl) => {
        const spot = bowlMoves.get(bowl.id);
        return spot ? { ...bowl, x: spot.x, y: spot.y } : bowl;
      });
      bowls = bowls.map((bowl) => {
        if (!bowlMoves.has(bowl.id)) return bowl;
        const others = bowls.filter((item) => !bowlMoves.has(item.id));
        return { ...bowl, ...moveBowl(bowl, bowl.x, bowl.y, others, state.settings, earSolids(state.ears, state.settings)) };
      });
      const ears = state.ears.map((ear) => {
        const spot = earMoves.get(ear.id);
        if (!spot) return ear;
        const next = clampSpot(spot.x, spot.y, state.settings, bowls, 0.2);
        return { ...ear, x: next.x, y: next.y };
      });
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { presetId: null, bowls, ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  scaleGroup: (patch) =>
    set((state) => {
      stamp(state);
      const sizes = new Map((patch.bowls ?? []).map((item) => [item.id, item.size]));
      const bowls = state.bowls.map((bowl) => {
        const size = sizes.get(bowl.id);
        if (size === undefined) return bowl;
        const others = state.bowls.filter((item) => item.id !== bowl.id);
        return { ...bowl, size: limitBowl(bowl, "size", size, 0.36, 1, others, state.settings, earSolids(state.ears, state.settings)) };
      });
      const cones = new Map((patch.cones ?? []).map((item) => [item.id, item]));
      const ears = state.ears.map((ear) => {
        const cone = cones.get(ear.id);
        if (!cone) return ear;
        return {
          ...ear,
          left: clampSide({ ...ear.left, size: cone.left }),
          right: clampSide({ ...ear.right, size: cone.right }),
        };
      });
      return { presetId: null, bowls, ears };
    }),

  turnGroup: (turns) =>
    set((state) => {
      stamp(state);
      const byId = new Map(turns.map((turn) => [turn.id, turn.yaw]));
      const ears = state.ears.map((ear) => (byId.has(ear.id) ? { ...ear, yaw: wrapAngle(byId.get(ear.id)!) } : ear));
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { presetId: null, ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  nudgeSelection: (dx, dy) =>
    set((state) => {
      stamp(state);
      const bowlIds = new Set(state.selection.filter((key) => key.startsWith("b:")).map((key) => key.slice(2)));
      const earIds = new Set(state.selection.filter((key) => key.startsWith("e:")).map((key) => key.slice(2)));
      if (state.focus === "bowl" && state.selectedId) bowlIds.add(state.selectedId);
      if (state.focus === "ear") earIds.add(state.activeEarId);
      if (state.focus === "dome" && state.selectedId) {
        const domes = state.domes.map((dome) => {
          if (dome.id !== state.selectedId) return dome;
          const spot = clampSpot(dome.x + dx, dome.y + dy, state.settings, state.bowls, 0.12 + dome.size * 0.08);
          return { ...dome, ...spot };
        });
        return { presetId: null, domes };
      }
      let bowls = state.bowls.map((bowl) => (bowlIds.has(bowl.id) ? { ...bowl, x: bowl.x + dx, y: bowl.y + dy } : bowl));
      bowls = bowls.map((bowl) => {
        if (!bowlIds.has(bowl.id)) return bowl;
        const others = bowls.filter((item) => !bowlIds.has(item.id));
        return { ...bowl, ...moveBowl(bowl, bowl.x, bowl.y, others, state.settings, earSolids(state.ears, state.settings)) };
      });
      const ears = state.ears.map((ear) => {
        if (!earIds.has(ear.id)) return ear;
        const spot = clampSpot(ear.x + dx, ear.y + dy, state.settings, bowls, 0.2);
        return { ...ear, ...spot };
      });
      const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
      return { presetId: null, bowls, ears, receiver: active ? poseOf(active) : state.receiver };
    }),

  setPlaying: (playing) => set({ playing }),
  setNotice: (notice) => set({ notice }),

  applyCast: (snap) => {
    const settings = { ...DEFAULT_SETTINGS, ...snap.settings };
    const ears = snap.ears.slice(0, MAX_EARS);
    const active = ears.find((ear) => ear.id === snap.activeEarId) ?? ears[0];
    if (!active) return;
    const prev = get();
    const prevEar = prev.ears[0];
    const nextEar = ears[0];
    let cycleFlight = prev.cycleFlight;
    if (prevEar && nextEar && prevEar.id !== nextEar.id) {
      const from = receiverPoint(prevEar, prev.settings);
      const ms = Math.round(cycleFadeSeconds(typeof snap.cycleSeconds === "number" ? snap.cycleSeconds : prev.cycleSeconds) * 1000);
      cycleFlight = {
        x: from.x,
        y: from.y,
        z: from.z,
        yaw: facingYaw(prevEar, prev.settings),
        until: Date.now() + ms,
        leaveId: prevEar.id,
        ms,
      };
    }
    const cycleSeconds =
      typeof snap.cycleSeconds === "number" ? clampCycleSeconds(snap.cycleSeconds) : prev.cycleSeconds;
    set({
      bowls: snap.bowls.slice(0, MAX_BOWLS),
      settings,
      ears,
      receiver: active,
      activeEarId: active.id,
      selectedId: snap.selectedId,
      focus: snap.focus === "ear" ? "ear" : snap.focus === "dome" ? "dome" : "bowl",
      selection: Array.isArray(snap.selection) ? snap.selection : [],
      domes: Array.isArray(snap.domes) ? snap.domes.slice(0, MAX_DOMES).map((dome) => clampDome(dome)) : prev.domes,
      presetId: snap.presetId,
      originPresetId: snap.originPresetId,
      activeName: snap.activeName,
      playing: snap.playing,
      shareRef: null,
      handoff: false,
      previewEarId:
        typeof snap.previewEarId === "string" && ears.some((ear) => ear.id === snap.previewEarId) ? snap.previewEarId : null,
      cycleThrough: typeof snap.cycleThrough === "boolean" ? snap.cycleThrough : prev.cycleThrough,
      cycleSeconds,
      cycleFlight,
    });
  },

  saveSoundscape: (raw) => {
    const name = raw.trim().slice(0, 48);
    if (!name) {
      set({ notice: "Name the soundscape before saving." });
      return;
    }
    const { bowls, settings, library } = get();
    const existing = library.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const ref = get().shareRef;
    const templateId = get().sourceTemplateId;
    const liveShare = ref && templateId ? { userSlug: ref.userSlug, slug: ref.slug, templateId } : undefined;
    const namedLive = get().activeName?.toLowerCase() === name.toLowerCase() ? liveShare : undefined;
    const share = namedLive ?? existing?.share;
    const entry: Soundscape = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      updatedAt: Date.now(),
      bowls: bowls.map((bowl) => ({ ...bowl })),
      settings: { ...settings },
      receiver: { ...get().receiver },
      ears: get().ears.map((ear) => ({ ...ear, left: { ...ear.left }, right: { ...ear.right } })),
      domes: get().domes.map((dome) => ({ ...dome })),
      ...(share ? { share } : {}),
    };
    const next = existing
      ? library.map((item) => (item.id === existing.id ? entry : item))
      : [entry, ...library];
    set({
      library: next,
      activeName: name,
      notice: existing ? `Updated “${name}”. Share it from the link.` : `Saved “${name}”. Share it from the link.`,
    });
  },

  loadSoundscape: (id) => {
    const item = get().library.find((entry) => entry.id === id);
    if (!item) return;
    const settings = { ...DEFAULT_SETTINGS, ...item.settings };
    const bowls = separateBowls(item.bowls.map((bowl) => normalizeBowl(bowl)), settings);
    const packed = earsFrom(item.receiver, item.ears);
    const share = savedShare(item);
    set({
      bowls,
      domes: Array.isArray(item.domes) ? item.domes.map((dome) => clampDome(dome)).slice(0, MAX_DOMES) : [],
      settings,
      ears: packed.ears,
      activeEarId: packed.activeEarId,
      receiver: poseOf(packed.ears[0]!),
      focus: "bowl",
      selectedId: item.bowls[0]?.id ?? null,
      presetId: null,
      originPresetId: null,
      activeName: item.name,
      sourceTemplateId: share?.templateId ?? null,
      shareRef: share ? { userSlug: share.userSlug, slug: share.slug } : null,
      handoff: false,
      previewEarId: null,
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

  stampShare: (stamp) =>
    set((state) => {
      const share = { userSlug: stamp.userSlug, slug: stamp.slug, templateId: stamp.templateId };
      const library = state.library.map((item) => {
        if (stamp.savedId && item.id === stamp.savedId) return { ...item, share };
        if (!stamp.savedId && item.name.toLowerCase() === stamp.name.toLowerCase()) return { ...item, share };
        return item;
      });
      if (!stamp.bindLive) return { library };
      return {
        library,
        sourceTemplateId: stamp.templateId,
        shareRef: { userSlug: stamp.userSlug, slug: stamp.slug },
        activeName: stamp.name,
        presetId: null,
      };
    }),

  loadPublished: (template) => {
    const gongs = Array.isArray(template.settings.gongs) ? template.settings.gongs : [];
    const bowls = template.bowls.map((bowl, index) =>
      normalizeBowl({
        ...bowl,
        id: crypto.randomUUID(),
        muted: Boolean(bowl.muted),
        gong: isGong(bowl.gong) ? bowl.gong : isGong(gongs[index]) ? gongs[index] : undefined,
      }),
    );
    if (bowls.length < MIN_BOWLS) {
      set({ notice: "That bath is missing bowls." });
      return;
    }
    const local = get().settings;
    const incoming = { ...template.settings };
    delete incoming.poster;
    const settings = {
      ...DEFAULT_SETTINGS,
      ...incoming,
      volume: local.volume,
      awake: local.awake,
      output: local.output,
    };
    const ear = makeEar(normalizeReceiver(template.receiver), "ear-1");
    const ears = template.ears?.length ? template.ears.map((item, index) => ({ ...item, id: item.id || `ear-${index + 1}`, left: { ...item.left }, right: { ...item.right } })) : [ear];
    const primary = ears[0] ?? ear;
    const domes = Array.isArray(template.settings.domes) ? template.settings.domes.map((dome) => clampDome(dome)).slice(0, MAX_DOMES) : [];
    set({
      bowls: separateBowls(bowls, settings),
      settings,
      domes,
      ears,
      activeEarId: primary.id,
      receiver: poseOf(primary),
      focus: "bowl",
      selectedId: bowls[0]?.id ?? null,
      presetId: null,
      originPresetId: null,
      activeName: template.title,
      sourceTemplateId: template.id,
      shareRef: template.userSlug && template.slug ? { userSlug: template.userSlug, slug: template.slug } : null,
      changed: false,
      loadStamp: Date.now(),
      handoff: false,
      previewEarId: null,
      notice: `Listening to “${template.title}”.`,
    });
  },

  hydrate: () => {
    if (get().hydrated) return true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return false;
      }
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.version !== 1 || !Array.isArray(parsed.bowls) || parsed.bowls.length < MIN_BOWLS) {
        set({ hydrated: true });
        return false;
      }
      if (!parsed.bowls.every(isBowl)) {
        set({ hydrated: true });
        return false;
      }
      const library = Array.isArray(parsed.library) ? parsed.library.filter(isSoundscape) : [];
      const settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      const bowls = separateBowls(parsed.bowls.map((bowl) => normalizeBowl(bowl)), settings);
      const packed = earsFrom(parsed.receiver, parsed.ears);
      set({
        bowls,
        settings,
        presetId: parsed.presetId,
        originPresetId: parsed.originPresetId,
        activeName: parsed.activeName,
        ears: packed.ears,
        domes: Array.isArray(parsed.domes) ? parsed.domes.filter(isDome).map((dome) => clampDome(dome)).slice(0, MAX_DOMES) : [],
        activeEarId: packed.ears.some((ear) => ear.id === parsed.activeEarId) ? parsed.activeEarId! : packed.activeEarId,
        receiver: poseOf(packed.ears.find((ear) => ear.id === parsed.activeEarId) ?? packed.ears[0]!),
        focus: parsed.focus === "ear" ? "ear" : parsed.focus === "dome" ? "dome" : "bowl",
        selectedId: parsed.selectedId && parsed.bowls.some((bowl) => bowl.id === parsed.selectedId) ? parsed.selectedId : parsed.bowls[0]?.id ?? null,
        selection:
          parsed.focus === "ear"
            ? [`e:${packed.ears.some((ear) => ear.id === parsed.activeEarId) ? parsed.activeEarId : packed.activeEarId}`]
            : [`b:${parsed.selectedId && parsed.bowls.some((bowl) => bowl.id === parsed.selectedId) ? parsed.selectedId : parsed.bowls[0]?.id}`],
        library,
        sourceTemplateId: typeof parsed.sourceTemplateId === "string" ? parsed.sourceTemplateId : null,
        shareRef:
          parsed.shareRef &&
          typeof parsed.shareRef.userSlug === "string" &&
          typeof parsed.shareRef.slug === "string"
            ? { userSlug: parsed.shareRef.userSlug, slug: parsed.shareRef.slug }
            : null,
        hydrated: true,
      });
      return true;
    } catch {
      set({ hydrated: true });
      return false;
    }
  },
}));

function sceneChanged(
  prev: { bowls: BathState["bowls"]; ears: BathState["ears"]; domes: BathState["domes"]; receiver: BathState["receiver"]; settings: BathState["settings"] },
  next: { bowls: BathState["bowls"]; ears: BathState["ears"]; domes: BathState["domes"]; receiver: BathState["receiver"]; settings: BathState["settings"] },
): boolean {
  if (prev.bowls !== next.bowls || prev.ears !== next.ears || prev.domes !== next.domes || prev.receiver !== next.receiver) return true;
  if (prev.settings === next.settings) return false;
  const { volume: _v, awake: _a, output: _o, ...restPrev } = prev.settings;
  const { volume: _v2, awake: _a2, output: _o2, ...restNext } = next.settings;
  return JSON.stringify(restPrev) !== JSON.stringify(restNext);
}

useBath.subscribe((state, prev) => {
  if (!prev || (state.ears === prev.ears && state.settings === prev.settings && state.bowls === prev.bowls)) return;
  const ears = state.ears.map((ear) => containEar(ear, state.settings, state.bowls, state.ears));
  if (ears.every((ear, index) => ear === state.ears[index])) return;
  const active = ears.find((ear) => ear.id === state.activeEarId) ?? ears[0];
  useBath.setState({ ears, receiver: active ? poseOf(active) : state.receiver });
});

useBath.subscribe((state, prev) => {
  if (state.changed || !prev || state.loadStamp !== prev.loadStamp) return;
  const sourced = state.presetId || state.originPresetId || state.sourceTemplateId;
  if (!sourced) return;
  if (!state.presetId && prev.presetId && state.originPresetId) {
    useBath.setState({ changed: true });
    return;
  }
  if (state.presetId !== prev.presetId || state.sourceTemplateId !== prev.sourceTemplateId) return;
  if (sceneChanged(prev, state)) useBath.setState({ changed: true });
});

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
        ears: state.ears,
        domes: state.domes,
        activeEarId: state.activeEarId,
        focus: state.focus,
        sourceTemplateId: state.sourceTemplateId,
        shareRef: state.shareRef,
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
