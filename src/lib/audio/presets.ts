import type { Bowl, Ear, GlassId, MusicalSettings, Preset, PresetBowl, PresetDome, PresetEar, RoomShapeId } from "@/lib/audio/types";
import { MAX_BOWLS, MAX_DOMES, MAX_EARS, MIN_BOWLS } from "@/lib/audio/types";
import { roomPatch } from "@/lib/audio/rooms";
import { makeEar } from "@/lib/audio/space";
import type { GongId } from "@/lib/audio/gong";
import { DOME_SIZE_MAX, freshDome } from "@/lib/audio/dome";
import { AI_PRESETS } from "@/lib/audio/ai-presets";

const rotunda = roomPatch("rotunda");

export const DEFAULT_MUSIC: MusicalSettings = {
  loopMode: "continuous",
  period: 24,
  veil: 0,
  veilHz: 0.45,
  shimmer: 0.28,
  binaural: false,
  binauralCarrier: 128,
  binauralBeat: 1,
  binauralLevel: 0.4,
  wet: 0.16,
  hall: 0.4,
  air: 0.12,
  transpose: 0,
  ...rotunda,
  size: 4,
};

export const DEFAULT_SETTINGS = {
  ...DEFAULT_MUSIC,
  volume: 0.84,
  awake: false,
  output: "direct" as const,
};

const b = (
  frequency: number,
  size: number,
  glass: GlassId,
  x: number,
  y: number,
  gain = 0.76,
  sing = 0.24,
  height?: number,
  gong?: GongId,
): PresetBowl => ({
  frequency,
  size,
  height: height ?? Math.min(1, Math.max(0.22, 0.3 + size * 0.48)),
  glass,
  x,
  y,
  gain,
  sing,
  ...(gong ? { gong } : {}),
});

function roomTune(shape: RoomShapeId, extra: Partial<MusicalSettings> = {}): Partial<MusicalSettings> {
  return { ...roomPatch(shape), ...extra, roomShape: shape };
}

function stemRing(radius: number, tilt: number): PresetEar[] {
  return Array.from({ length: MAX_EARS }, (_, index) => {
    const angle = (index / MAX_EARS) * Math.PI * 2 + tilt;
    const x = Math.round((0.5 + Math.cos(angle) * radius) * 100) / 100;
    const y = Math.round((0.5 + Math.sin(angle) * radius) * 100) / 100;
    const height = Math.round((0.2 + (index / (MAX_EARS - 1)) * 0.72) * 100) / 100;
    const left = Math.round((0.48 + (index % 4) * 0.22) * 100) / 100;
    const right = Math.round((0.42 + ((index + 2) % 4) * 0.26) * 100) / 100;
    return ear(x, y, height, index * 0.18, left, right, 0.1 + (index % 3) * 0.03);
  });
}

export function presetIsDownload(preset: Pick<Preset, "download" | "ears">): boolean {
  return Boolean(preset.download) || (preset.ears?.length ?? 0) >= MAX_EARS;
}

function ear(
  x: number,
  y: number,
  height: number,
  yaw: number,
  leftSize = 0.72,
  rightSize = 0.72,
  spread = 0.14,
): PresetEar {
  return {
    x,
    y,
    height,
    yaw,
    left: { x: -spread, y: 0.02, z: 0.05, gain: 1, size: leftSize },
    right: { x: spread, y: 0.02, z: 0.05, gain: 1, size: rightSize },
  };
}

/** Left and right horns aimed apart, so each channel collects a different part of the room. */
function phase(
  x: number,
  y: number,
  height: number,
  yaw: number,
  pitch: number,
  leftPitch: number,
  rightPitch: number,
  leftSize: number,
  rightSize: number,
  spread = 0.15,
  leftGain = 1,
  rightGain = 1,
  leftYaw = 0,
  rightYaw = 0,
): PresetEar {
  return {
    x,
    y,
    height,
    yaw,
    pitch,
    left: { x: -spread, y: 0.05, z: 0.07, gain: leftGain, size: leftSize, pitch: leftPitch, yaw: leftYaw },
    right: { x: spread, y: -0.03, z: 0.05, gain: rightGain, size: rightSize, pitch: rightPitch, yaw: rightYaw },
  };
}

const HOUSE: Preset[] = [
  {
    id: "heart-chamber",
    name: "Heart Chamber",
    blurb: "Rose om in a small chapel, heard from down among the glass. A wide low bowl and a tall thin one. Close cones, so the first bounce stays warm.",
    tags: ["Listening", "Chapel", "Rose quartz"],
    settings: roomTune("chapel", { shimmer: 0.36, wet: 0.24, hall: 0.3, air: 0.08, early: 0.92, bloom: 0.88, decay: 0.24, flutter: 0.08, space: 0.28, absorption: 0.42, slap: 0.12, modes: 0.22, diffusion: 0.36, airLoss: 0.1 }),
    ears: [ear(0.74, 0.8, 0.36, 0.9, 0.55, 0.62, 0.1)],
    bowls: [
      b(136.1, 0.96, "rose", 0.34, 0.62, 0.86, 0.16, 0.26),
      b(136.52, 0.58, "rose", 0.72, 0.27, 0.7, 0.34, 0.94),
      b(204.15, 0.72, "rose", 0.06, 0.147, 0.62, 0.22, 0.48),
      b(272.2, 0.42, "selenite", 0.84, 0.64, 0.5, 0.4, 0.9),
      b(340.25, 0.5, "rose", 0.47, 0.3, 0.44, 0.3, 0.24),
    ],
  },
  {
    id: "split-current",
    name: "Split Current",
    blurb: "The left horn looks up into the air, wide and loud, and loses the top of the chord. The right horn looks down, narrow, into the low quartz. A slow binaural beat and a veil make the two channels drift apart and back.",
    tags: ["Listening", "Courtyard", "Phasing", "Binaural", "Split horns", "Veil"],
    settings: roomTune("court", {
      loopMode: "tide",
      period: 28,
      veil: 0.42,
      veilHz: 0.22,
      shimmer: 0.14,
      wet: 0.16,
      hall: 0.22,
      air: 0.04,
      decay: 0.2,
      early: 0.34,
      diffusion: 0.22,
      absorption: 0.62,
      flutter: 0.08,
      modes: 0.1,
      airLoss: 0.92,
      slap: 0.48,
      bloom: 0.12,
      space: 0.84,
      binaural: true,
      binauralCarrier: 110,
      binauralBeat: 0.35,
      binauralLevel: 0.55,
    }),
    ears: [phase(0.72, 0.78, 1.35, -0.7, 0.25, -1.05, 0.95, 1.45, 0.42, 0.18, 1, 0.55, -0.35, 0.55)],
    bowls: [
      b(110, 0.98, "quartz", 0.28, 0.7, 0.86, 0.1, 0.24, "felt"),
      b(110.45, 0.5, "aqua", 0.42, 0.34, 0.58, 0.2, 0.86),
      b(165, 0.62, "quartz", 0.74, 0.26, 0.52, 0.18, 0.32, "brass"),
      b(220.4, 0.4, "selenite", 0.62, 0.62, 0.4, 0.28, 0.9),
    ],
  },
  {
    id: "phase-cube",
    name: "Phase Cube",
    blurb: "Standing waves in a cube, but the horns do not share them. The left mouth aims down into one corner. The right mouth turns toward the far wall and looks up. Each mallet lands in a different channel.",
    tags: ["Listening", "Cube", "Phasing", "Split horns", "Mallet", "Gong"],
    settings: roomTune("cube", {
      loopMode: "mallet",
      period: 12,
      shimmer: 0.08,
      wet: 0.2,
      hall: 0.3,
      air: 0.02,
      decay: 0.44,
      early: 0.72,
      diffusion: 0.12,
      absorption: 0.14,
      flutter: 0.86,
      modes: 0.94,
      airLoss: 0.14,
      slap: 0.32,
      bloom: 0.4,
      space: 0.55,
      veil: 0.16,
      veilHz: 0.5,
    }),
    ears: [phase(0.24, 0.76, 0.7, 0.55, 0.4, 1.05, -0.85, 0.95, 0.7, 0.16, 0.9, 0.72, 0.4, -0.85)],
    bowls: [
      b(64, 1, "quartz", 0.18, 0.48, 0.9, 0.06, 0.28, "wood"),
      b(64.4, 0.55, "obsidian", 0.82, 0.52, 0.7, 0.12, 0.92, "brass"),
      b(96, 0.7, "quartz", 0.5, 0.22, 0.58, 0.14, 0.4),
      b(128.35, 0.46, "platinum", 0.72, 0.74, 0.42, 0.22, 0.78, "rubber"),
    ],
  },
  {
    id: "drift-lattice",
    name: "Drift Lattice",
    blurb: "Gold on the long walls, heard as two widths. The left cone is large and level with the glass. The right cone is small, pitched up, and turned toward the other wall. A veil slowly beats the channels out of step.",
    tags: ["Listening", "Shoebox", "Phasing", "Veil", "Split horns", "Breath"],
    settings: roomTune("shoebox", {
      loopMode: "breath",
      period: 18,
      veil: 0.48,
      veilHz: 0.16,
      shimmer: 0.3,
      wet: 0.26,
      hall: 0.52,
      air: 0.1,
      decay: 0.68,
      early: 0.86,
      diffusion: 0.5,
      absorption: 0.24,
      flutter: 0.18,
      modes: 0.28,
      airLoss: 0.2,
      slap: 0.14,
      bloom: 0.34,
      space: 0.96,
      binaural: true,
      binauralCarrier: 128,
      binauralBeat: 0.5,
      binauralLevel: 0.36,
    }),
    ears: [phase(0.48, 0.56, 0.85, -1.05, 0.15, 0.2, -0.95, 1.55, 0.38, 0.2, 1, 0.48, 0.15, -0.7)],
    bowls: [
      b(128, 0.94, "gold", 0.16, 0.6, 0.82, 0.12, 0.3, "felt"),
      b(128.3, 0.5, "platinum", 0.84, 0.44, 0.6, 0.26, 0.86),
      b(192, 0.7, "gold", 0.22, 0.2, 0.54, 0.18, 0.42, "suede"),
      b(256.4, 0.42, "emerald", 0.78, 0.72, 0.4, 0.3, 0.9),
      b(320, 0.38, "gold", 0.5, 0.34, 0.34, 0.22, 0.26),
    ],
  },
  {
    id: "moon-pool",
    name: "Moon Pool",
    blurb: "A just pentatonic breath under a dome. Short bowls and tall ones share one smooth tail. The ear is high, cones open overhead.",
    tags: ["Listening", "Dome", "Breath"],
    settings: roomTune("dome", { loopMode: "breath", period: 20, veil: 0.08, veilHz: 0.24, shimmer: 0.48, wet: 0.32, hall: 0.66, air: 0.06, decay: 0.84, early: 0.34, diffusion: 0.96, absorption: 0.22, flutter: 0.06, modes: 0.58, airLoss: 0.16, slap: 0.3, bloom: 0.7, space: 0.68 }),
    ears: [ear(0.5, 0.5, 0.9, 0.75, 1.05, 0.9, 0.12)],
    bowls: [
      b(98, 0.92, "frosted", 0.5, 0.72, 0.84, 0.16, 0.28),
      b(110.25, 0.46, "frosted", 0.74, 0.5, 0.64, 0.3, 0.9),
      b(122.5, 0.78, "selenite", 0.5, 0.28, 0.58, 0.2, 0.36),
      b(147, 0.42, "aqua", 0.28, 0.5, 0.5, 0.34, 0.92),
      b(163.33, 0.6, "frosted", 0.64, 0.64, 0.44, 0.26, 0.24),
    ],
  },
  {
    id: "temple-dawn",
    name: "Temple Dawn",
    blurb: "The 432 family walks a nave. You stand at the near end. Platinum and aqua answer after the glass, and the far wall slaps.",
    tags: ["Listening", "Nave", "432 family"],
    settings: roomTune("nave", { shimmer: 0.4, wet: 0.34, hall: 0.8, air: 0.14, decay: 0.96, early: 0.52, diffusion: 0.4, absorption: 0.18, flutter: 0.26, modes: 0.38, airLoss: 0.48, slap: 0.8, bloom: 0.36, space: 0.78 }),
    ears: [ear(0.5, 0.9, 0.58, 0.12, 0.85, 0.7, 0.13)],
    bowls: [
      b(108, 0.98, "quartz", 0.18, 0.5, 0.8, 0.12, 0.3),
      b(144, 0.55, "quartz", 0.34, 0.5, 0.68, 0.22, 0.86),
      b(180, 0.78, "gold", 0.5, 0.5, 0.6, 0.18, 0.34),
      b(216, 0.44, "platinum", 0.66, 0.5, 0.5, 0.3, 0.9),
      b(288, 0.62, "platinum", 0.78, 0.42, 0.44, 0.24, 0.28),
      b(360, 0.4, "aqua", 0.86, 0.58, 0.36, 0.36, 0.78),
    ],
  },
  {
    id: "deep-earth",
    name: "Deep Earth",
    blurb: "Obsidian fifths on a long tide inside a cave. The highs sink into the stone. A low ear with a wide left cone keeps the bass in the corners.",
    tags: ["Listening", "Cave", "Tide"],
    settings: roomTune("cave", { loopMode: "tide", period: 44, shimmer: 0.12, wet: 0.38, hall: 0.74, air: 0.32, decay: 0.9, early: 0.46, diffusion: 0.88, absorption: 0.92, flutter: 0.3, modes: 0.78, airLoss: 0.72, slap: 0.34, bloom: 0.94, space: 0.46 }),
    ears: [ear(0.38, 0.74, 0.26, 0.55, 1.35, 0.7, 0.16)],
    bowls: [
      b(55, 1, "obsidian", 0.32, 0.58, 0.9, 0.08, 0.24),
      b(82.5, 0.46, "obsidian", 0.7, 0.36, 0.72, 0.16, 0.96),
      b(110, 0.84, "obsidian", 0.22, 0.32, 0.6, 0.12, 0.32),
      b(165, 0.4, "gold", 0.6, 0.16, 0.42, 0.28, 0.84),
    ],
  },
  {
    id: "interference-garden",
    name: "Interference Garden",
    blurb: "Four just fifths, each with a twin a third of a hertz sharp, on the wide side of a fan hall. You listen from the narrow end.",
    tags: ["Listening", "Fan hall", "Beats"],
    settings: roomTune("fan", { shimmer: 0.16, wet: 0.16, hall: 0.36, air: 0.04, decay: 0.48, early: 0.82, diffusion: 0.28, absorption: 0.24, flutter: 0.1, modes: 0.16, airLoss: 0.2, slap: 0.18, bloom: 0.18, space: 0.9 }),
    ears: [ear(0.48, 0.18, 0.62, 0.28, 0.8, 0.8, 0.11)],
    bowls: [
      b(110, 0.9, "phantom", 0.28, 0.72, 0.76, 0.14, 0.3),
      b(110.32, 0.48, "quartz", 0.45, 0.83, 0.62, 0.22, 0.88),
      b(165, 0.74, "phantom", 0.62, 0.66, 0.64, 0.18, 0.34),
      b(165.36, 0.4, "selenite", 0.76, 0.8, 0.52, 0.3, 0.86),
      b(220, 0.66, "phantom", 0.36, 0.56, 0.54, 0.2, 0.28),
      b(330, 0.38, "platinum", 0.73, 0.45, 0.4, 0.34, 0.8),
    ],
  },
  {
    id: "solaris",
    name: "Solaris",
    blurb: "D major in a rotunda, gold and emerald at alternating heights. The ear is already turned, so the chord walks around you under a slow veil.",
    tags: ["Listening", "Rotunda", "Veil"],
    settings: roomTune("rotunda", { veil: 0.34, veilHz: 0.36, shimmer: 0.38, wet: 0.22, hall: 0.5, air: 0.1, decay: 0.58, early: 0.44, diffusion: 0.78, absorption: 0.24, flutter: 0.04, modes: 0.14, airLoss: 0.18, slap: 0.08, bloom: 0.32, space: 0.72 }),
    ears: [ear(0.66, 0.66, 0.58, 1.15, 0.9, 0.75, 0.15)],
    bowls: [
      b(146.83, 0.9, "gold", 0.5, 0.22, 0.8, 0.14, 0.28),
      b(183.54, 0.44, "emerald", 0.74, 0.4, 0.64, 0.32, 0.92),
      b(220.25, 0.72, "gold", 0.69, 0.71, 0.56, 0.2, 0.34),
      b(293.66, 0.4, "emerald", 0.42, 0.74, 0.48, 0.36, 0.9),
      b(367.08, 0.58, "platinum", 0.26, 0.56, 0.42, 0.24, 0.3),
      b(440.5, 0.38, "gold", 0.25, 0.28, 0.34, 0.4, 0.82),
    ],
  },
  {
    id: "phase-canon",
    name: "Phase Canon",
    blurb: "Fifths enter one after another down a corridor, and the ear walks with them. At each stop the left horn faces back up the hall and the right horn faces the next bowl. The channels trade the canon instead of sharing it.",
    tags: ["Listening", "Corridor", "Phasing", "Cycle", "Canon", "Split horns"],
    cycle: { on: true, seconds: 4 },
    settings: roomTune("corridor", {
      loopMode: "canon",
      period: 24,
      shimmer: 0.18,
      wet: 0.24,
      hall: 0.36,
      air: 0.08,
      decay: 0.5,
      early: 0.7,
      diffusion: 0.16,
      absorption: 0.14,
      flutter: 0.9,
      modes: 0.3,
      airLoss: 0.36,
      slap: 0.82,
      bloom: 0.18,
      space: 0.42,
      veil: 0.2,
      veilHz: 0.3,
    }),
    ears: [
      phase(0.16, 0.5, 0.55, 0.05, 0.2, 0.35, -0.2, 0.8, 1.15, 0.12, 0.85, 1, 0.7, -0.15),
      phase(0.42, 0.46, 1.15, 0.08, 0.35, -0.8, 0.9, 1.2, 0.48, 0.14, 1, 0.5, -0.55, 0.6),
      phase(0.72, 0.54, 2.1, -0.1, 0.55, 0.7, -1.05, 0.55, 1.35, 0.16, 0.45, 0.95, 0.4, -0.75),
    ],
    bowls: [
      b(110, 0.96, "gold", 0.22, 0.5, 0.84, 0.12, 0.26, "wood"),
      b(165, 0.52, "gold", 0.4, 0.42, 0.68, 0.22, 0.86, "felt"),
      b(247.5, 0.72, "emerald", 0.56, 0.58, 0.56, 0.18, 0.34, "brass"),
      b(371.25, 0.42, "platinum", 0.74, 0.46, 0.44, 0.3, 0.8),
      b(556.5, 0.4, "gold", 0.88, 0.52, 0.36, 0.26, 0.3, "suede"),
    ],
  },
  {
    id: "gilded-vespers",
    name: "Gilded Vespers",
    blurb: "Platinum and gold in a gilded hall, slow decay, seated in the middle. The left cone is wider, so the west wall arrives first.",
    tags: ["Listening", "Gilded hall", "Platinum"],
    settings: roomTune("gilded", { shimmer: 0.42, wet: 0.3, hall: 0.7, air: 0.12, decay: 0.88, early: 0.6, diffusion: 0.55, absorption: 0.2, flutter: 0.12, modes: 0.24, airLoss: 0.28, slap: 0.22, bloom: 0.48, space: 0.84 }),
    ears: [ear(0.5, 0.62, 0.5, -0.4, 1.3, 0.55, 0.16)],
    bowls: [
      b(98, 0.94, "platinum", 0.22, 0.34, 0.8, 0.12, 0.3),
      b(146.83, 0.62, "gold", 0.78, 0.3, 0.66, 0.22, 0.7),
      b(196, 0.48, "platinum", 0.3, 0.7, 0.54, 0.28, 0.9),
      b(293.66, 0.4, "gold", 0.72, 0.68, 0.42, 0.34, 0.4),
    ],
  },
  {
    id: "facet-phase",
    name: "Facet Phase",
    blurb: "Four stops around an octagon. Each one opens a different horn: left, then right, then a high left, then a low right. The bells stay put. The channel that catches them keeps changing.",
    tags: ["Listening", "Octagon", "Phasing", "Cycle", "Gong", "Split horns"],
    cycle: { on: true, seconds: 2.5 },
    settings: roomTune("octagon", {
      loopMode: "mallet",
      period: 10,
      shimmer: 0.26,
      wet: 0.2,
      hall: 0.34,
      air: 0.06,
      decay: 0.4,
      early: 0.7,
      diffusion: 0.62,
      absorption: 0.28,
      flutter: 0.1,
      modes: 0.16,
      airLoss: 0.18,
      slap: 0.16,
      bloom: 0.22,
      space: 0.66,
      veil: 0.14,
      veilHz: 0.4,
    }),
    ears: [
      phase(0.5, 0.78, 0.6, 0.1, 0.3, 0.15, 0.9, 1.2, 0.4, 0.12, 1, 0.28, 0.1, 0.2),
      phase(0.78, 0.5, 1.2, 1.6, 0.45, -0.9, 0.2, 0.42, 1.35, 0.14, 0.3, 1, -0.2, -0.1),
      phase(0.5, 0.22, 2.2, 3.1, 0.6, -1.1, 0.55, 1.4, 0.5, 0.15, 0.95, 0.35, 0.5, -0.4),
      phase(0.22, 0.5, 0.85, -1.55, 0.25, 0.85, -0.7, 0.55, 1.15, 0.13, 0.4, 0.9, -0.35, 0.45),
    ],
    bowls: [
      b(220, 0.72, "quartz", 0.5, 0.28, 0.76, 0.18, 0.36, "wood"),
      b(277.18, 0.48, "aqua", 0.72, 0.46, 0.6, 0.28, 0.84, "brass"),
      b(329.63, 0.58, "quartz", 0.46, 0.68, 0.5, 0.2, 0.32, "felt"),
      b(440.3, 0.4, "aqua", 0.3, 0.52, 0.4, 0.32, 0.78, "rubber"),
    ],
  },
  {
    id: "apse-whisper",
    name: "Apse Whisper",
    blurb: "Selenite and rose tucked into an apse. A breath cycle, and the ear sits in the curve looking back at the glass.",
    tags: ["Listening", "Apse", "Selenite"],
    settings: roomTune("apse", { loopMode: "breath", period: 16, veil: 0.12, veilHz: 0.2, shimmer: 0.46, wet: 0.26, hall: 0.48, air: 0.1, decay: 0.5, early: 0.88, diffusion: 0.4, absorption: 0.34, flutter: 0.16, modes: 0.2, airLoss: 0.18, slap: 0.26, bloom: 0.4, space: 0.36 }),
    ears: [ear(0.78, 0.78, 0.44, 2.2, 0.66, 0.8, 0.1)],
    bowls: [
      b(174.61, 0.8, "selenite", 0.42, 0.4, 0.72, 0.16, 0.32),
      b(196, 0.5, "rose", 0.28, 0.62, 0.6, 0.26, 0.84),
      b(220, 0.42, "selenite", 0.58, 0.7, 0.5, 0.3, 0.9),
      b(261.63, 0.62, "rose", 0.36, 0.24, 0.46, 0.2, 0.4),
    ],
  },
  {
    id: "ellipse-drift",
    name: "Ellipse Drift",
    blurb: "Frosted and phantom on a long ellipse. The tide is slow and the ear sits off-center, one cone longer so the far focus arrives later.",
    tags: ["Listening", "Ellipse", "Tide"],
    settings: roomTune("ellipse", { loopMode: "tide", period: 36, veil: 0.16, veilHz: 0.22, shimmer: 0.26, wet: 0.2, hall: 0.44, air: 0.16, decay: 0.7, early: 0.4, diffusion: 0.62, absorption: 0.36, flutter: 0.14, modes: 0.28, airLoss: 0.34, slap: 0.2, bloom: 0.36, space: 0.66 }),
    ears: [ear(0.34, 0.58, 0.56, 0.35, 1.2, 0.6, 0.14)],
    bowls: [
      b(82.41, 0.9, "frosted", 0.3, 0.5, 0.78, 0.12, 0.28),
      b(123.47, 0.55, "phantom", 0.55, 0.32, 0.64, 0.22, 0.7),
      b(164.81, 0.7, "frosted", 0.72, 0.55, 0.56, 0.18, 0.34),
      b(246.94, 0.4, "phantom", 0.48, 0.74, 0.42, 0.3, 0.88),
    ],
  },
  {
    id: "court-noon",
    name: "Court Noon",
    blurb: "Dry aqua and emerald in the open court at noon. Almost no hall. High cones, so only the bowls directly ahead stay bright.",
    tags: ["Listening", "Courtyard", "Aqua"],
    settings: roomTune("court", { shimmer: 0.18, wet: 0.06, hall: 0.1, air: 0, decay: 0.08, early: 0.22, diffusion: 0.12, absorption: 0.8, flutter: 0.06, modes: 0.06, airLoss: 0.7, slap: 0.4, bloom: 0.06, space: 0.2 }),
    ears: [ear(0.5, 0.22, 0.7, 0.15, 0.5, 0.5, 0.18)],
    bowls: [
      b(196, 0.84, "aqua", 0.32, 0.62, 0.76, 0.16, 0.36),
      b(246.94, 0.5, "emerald", 0.68, 0.58, 0.62, 0.28, 0.86),
      b(293.66, 0.62, "aqua", 0.5, 0.36, 0.5, 0.2, 0.4),
      b(392, 0.4, "emerald", 0.24, 0.44, 0.4, 0.34, 0.78),
    ],
  },
  {
    id: "chapel-aqua",
    name: "Chapel of Aqua",
    blurb: "Aqua glass in the chapel with the early reflections pushed up. Low cones point into the nearest bowl so the slap is the whole phrase.",
    tags: ["Listening", "Chapel", "Early reflections"],
    settings: roomTune("chapel", { shimmer: 0.22, wet: 0.18, hall: 0.28, air: 0.06, decay: 0.32, early: 0.96, diffusion: 0.3, absorption: 0.28, flutter: 0.1, modes: 0.16, airLoss: 0.14, slap: 0.55, bloom: 0.5, space: 0.32 }),
    ears: [ear(0.58, 0.72, 0.34, 0.5, 0.7, 0.48, 0.08)],
    bowls: [
      b(146.83, 0.88, "aqua", 0.36, 0.4, 0.8, 0.14, 0.3),
      b(185, 0.52, "aqua", 0.66, 0.48, 0.64, 0.26, 0.82),
      b(220, 0.7, "quartz", 0.28, 0.62, 0.54, 0.18, 0.36),
      b(293.66, 0.42, "selenite", 0.74, 0.7, 0.4, 0.32, 0.88),
    ],
  },
  {
    id: "cube-corner",
    name: "Cube Corner",
    blurb: "Obsidian and platinum locked to the modes of a cube. The ear is in a corner. Narrow cones make the standing waves tick instead of wash.",
    tags: ["Listening", "Cube", "Room modes"],
    settings: roomTune("cube", { shimmer: 0.08, wet: 0.16, hall: 0.22, air: 0.04, decay: 0.5, early: 0.6, diffusion: 0.06, absorption: 0.1, flutter: 0.7, modes: 0.98, airLoss: 0.16, slap: 0.24, bloom: 0.3, space: 0.12 }),
    ears: [ear(0.18, 0.18, 0.4, 0.8, 0.36, 0.36, 0.07)],
    bowls: [
      b(73.42, 0.96, "obsidian", 0.5, 0.5, 0.86, 0.08, 0.28),
      b(110, 0.6, "platinum", 0.28, 0.72, 0.66, 0.18, 0.7),
      b(146.83, 0.48, "obsidian", 0.74, 0.3, 0.52, 0.22, 0.9),
      b(220, 0.4, "platinum", 0.7, 0.7, 0.4, 0.3, 0.4),
    ],
  },
  {
    id: "dome-crown",
    name: "Dome Crown",
    blurb: "Selenite under a dome with the crown shimmer high. The ear is near the top. Both cones are long, so the whole ring of glass gathers overhead.",
    tags: ["Listening", "Dome", "Shimmer"],
    settings: roomTune("dome", { shimmer: 0.72, wet: 0.28, hall: 0.6, air: 0.08, decay: 0.76, early: 0.3, diffusion: 0.92, absorption: 0.18, flutter: 0.04, modes: 0.4, airLoss: 0.12, slap: 0.1, bloom: 0.66, space: 0.8 }),
    ears: [ear(0.5, 0.46, 0.94, 0.2, 1.4, 1.25, 0.12)],
    bowls: [
      b(164.81, 0.5, "selenite", 0.32, 0.5, 0.6, 0.34, 0.92),
      b(196, 0.78, "selenite", 0.5, 0.28, 0.72, 0.16, 0.3),
      b(246.94, 0.44, "frosted", 0.68, 0.48, 0.5, 0.28, 0.8),
      b(329.63, 0.4, "selenite", 0.42, 0.7, 0.4, 0.36, 0.86),
    ],
  },
  {
    id: "nave-procession",
    name: "Nave Procession",
    blurb: "Rose warms into gold down the aisle. A canon, and you walk it from the back with matched cones.",
    tags: ["Listening", "Nave", "Canon"],
    settings: roomTune("nave", { loopMode: "canon", period: 28, shimmer: 0.32, wet: 0.3, hall: 0.72, air: 0.12, decay: 0.8, early: 0.48, diffusion: 0.36, absorption: 0.22, flutter: 0.2, modes: 0.26, airLoss: 0.4, slap: 0.62, bloom: 0.28, space: 0.58 }),
    ears: [ear(0.5, 0.88, 0.5, 0.02, 0.88, 0.88, 0.12)],
    bowls: [
      b(130.81, 0.9, "rose", 0.22, 0.5, 0.78, 0.12, 0.28),
      b(164.81, 0.6, "rose", 0.4, 0.42, 0.66, 0.22, 0.7),
      b(196, 0.74, "gold", 0.56, 0.58, 0.58, 0.18, 0.34),
      b(246.94, 0.46, "gold", 0.72, 0.46, 0.48, 0.3, 0.86),
      b(329.63, 0.4, "platinum", 0.86, 0.54, 0.38, 0.32, 0.4),
    ],
  },
  {
    id: "shoebox-silk",
    name: "Shoebox Silk",
    blurb: "Frosted glass and a soft hall, intimate cones. The dry crystal stays close. This is the small-room listening setup.",
    tags: ["Listening", "Shoebox", "Frosted"],
    settings: roomTune("shoebox", { shimmer: 0.2, wet: 0.4, hall: 0.66, air: 0.18, decay: 0.6, early: 0.36, diffusion: 0.5, absorption: 0.4, flutter: 0.1, modes: 0.14, airLoss: 0.24, slap: 0.08, bloom: 0.22, space: 0.4 }),
    ears: [ear(0.5, 0.72, 0.48, 0.1, 0.38, 0.38, 0.08)],
    bowls: [
      b(174.61, 0.72, "frosted", 0.32, 0.4, 0.7, 0.18, 0.36),
      b(220, 0.48, "frosted", 0.68, 0.46, 0.58, 0.28, 0.84),
      b(261.63, 0.6, "quartz", 0.48, 0.24, 0.5, 0.2, 0.32),
      b(349.23, 0.4, "frosted", 0.3, 0.66, 0.4, 0.32, 0.78),
    ],
  },
  {
    id: "golden-thirds",
    name: "Golden Thirds",
    blurb: "Emerald thirds inside the golden rectangle. Continuous, moderate bloom, and the ear is turned so the long wall leads.",
    tags: ["Listening", "Golden hall", "Emerald"],
    settings: roomTune("golden", { shimmer: 0.36, wet: 0.24, hall: 0.52, air: 0.1, decay: 0.64, early: 0.7, diffusion: 0.48, absorption: 0.24, flutter: 0.14, modes: 0.22, airLoss: 0.2, slap: 0.18, bloom: 0.44, space: 0.86 }),
    ears: [ear(0.4, 0.7, 0.55, 0.65, 0.95, 0.8, 0.14)],
    bowls: [
      b(164.81, 0.86, "emerald", 0.28, 0.36, 0.78, 0.14, 0.3),
      b(207.65, 0.55, "emerald", 0.62, 0.32, 0.64, 0.26, 0.78),
      b(246.94, 0.7, "gold", 0.46, 0.58, 0.56, 0.18, 0.34),
      b(311.13, 0.42, "emerald", 0.74, 0.62, 0.44, 0.32, 0.88),
    ],
  },
  {
    id: "cave-mouth",
    name: "Cave Mouth",
    blurb: "Phantom and obsidian. You stand at the mouth looking in. The right cone is long and reaches the dark glass. The left stays short.",
    tags: ["Listening", "Cave", "Phantom"],
    settings: roomTune("cave", { shimmer: 0.14, wet: 0.34, hall: 0.58, air: 0.28, decay: 0.82, early: 0.5, diffusion: 0.8, absorption: 0.86, flutter: 0.22, modes: 0.6, airLoss: 0.66, slap: 0.3, bloom: 0.7, space: 0.4 }),
    ears: [ear(0.72, 0.16, 0.46, 2.6, 0.45, 1.4, 0.12)],
    bowls: [
      b(61.74, 1, "obsidian", 0.4, 0.62, 0.88, 0.08, 0.26),
      b(92.5, 0.6, "phantom", 0.62, 0.48, 0.66, 0.18, 0.7),
      b(123.47, 0.78, "phantom", 0.3, 0.4, 0.56, 0.14, 0.34),
      b(185, 0.42, "obsidian", 0.55, 0.78, 0.42, 0.26, 0.9),
    ],
  },
  {
    id: "fan-ascent",
    name: "Fan Ascent",
    blurb: "Aqua fifths climb toward the wide end of a fan hall. The ear is at the throat. Cones open as the room opens.",
    tags: ["Listening", "Fan hall", "Aqua"],
    settings: roomTune("fan", { loopMode: "breath", period: 18, shimmer: 0.28, wet: 0.2, hall: 0.4, air: 0.08, decay: 0.46, early: 0.78, diffusion: 0.34, absorption: 0.26, flutter: 0.12, modes: 0.18, airLoss: 0.22, slap: 0.2, bloom: 0.24, space: 0.92 }),
    ears: [ear(0.5, 0.16, 0.58, 0.05, 1.1, 1.1, 0.13)],
    bowls: [
      b(110, 0.88, "aqua", 0.42, 0.36, 0.8, 0.12, 0.28),
      b(165, 0.6, "aqua", 0.34, 0.58, 0.66, 0.2, 0.6),
      b(220, 0.5, "quartz", 0.58, 0.7, 0.54, 0.26, 0.84),
      b(330, 0.4, "aqua", 0.7, 0.82, 0.42, 0.32, 0.9),
    ],
  },
  {
    id: "rotunda-night",
    name: "Rotunda Night",
    blurb: "Low obsidian in a round room with a slow binaural bed. The ear is turned away from the brightest bowl. Small cones, late night.",
    tags: ["Listening", "Rotunda", "Binaural"],
    settings: roomTune("rotunda", { veil: 0.2, veilHz: 0.18, shimmer: 0.12, wet: 0.22, hall: 0.48, air: 0.2, decay: 0.66, early: 0.28, diffusion: 0.6, absorption: 0.38, flutter: 0.06, modes: 0.2, airLoss: 0.3, slap: 0.08, bloom: 0.5, space: 0.55, binaural: true, binauralCarrier: 96, binauralBeat: 1.4, binauralLevel: 0.36 }),
    ears: [ear(0.62, 0.4, 0.42, 1.8, 0.46, 0.52, 0.1)],
    bowls: [
      b(48, 1, "obsidian", 0.4, 0.62, 0.9, 0.06, 0.24),
      b(72, 0.7, "obsidian", 0.68, 0.48, 0.7, 0.14, 0.4),
      b(96, 0.5, "gold", 0.32, 0.32, 0.5, 0.22, 0.86),
      b(144, 0.4, "obsidian", 0.55, 0.22, 0.4, 0.28, 0.7),
    ],
  },
  {
    id: "four-mics",
    name: "Four Mics",
    blurb: "A quartz chord for recording. Ear 1 is what you hear, cones of a normal head. Two stems sit left and right with wider cones for the file.",
    tags: ["Recording", "Rotunda", "Three ears"],
    settings: roomTune("rotunda", { shimmer: 0.24, wet: 0.18, hall: 0.42, air: 0.08, decay: 0.5, early: 0.5, diffusion: 0.55, absorption: 0.28, flutter: 0.06, modes: 0.16, airLoss: 0.16, slap: 0.1, bloom: 0.3, space: 0.6 }),
    ears: [
      ear(0.5, 0.78, 0.55, 0.15, 0.7, 0.7, 0.12),
      ear(0.22, 0.48, 0.5, 0.9, 1.15, 0.85, 0.16),
      ear(0.78, 0.48, 0.5, -0.9, 0.85, 1.15, 0.16),
    ],
    bowls: [
      b(130.81, 0.86, "quartz", 0.4, 0.36, 0.78, 0.14, 0.3),
      b(164.81, 0.55, "quartz", 0.62, 0.4, 0.64, 0.24, 0.72),
      b(196, 0.68, "rose", 0.48, 0.22, 0.56, 0.18, 0.34),
      b(261.63, 0.42, "quartz", 0.3, 0.5, 0.44, 0.3, 0.86),
    ],
  },
  {
    id: "corridor-stems",
    name: "Corridor Stems",
    blurb: "The same gold line, recorded as a walk. You hear the near ear. A middle stem and a far stem keep their own left and right in the download.",
    tags: ["Recording", "Corridor", "Walk"],
    settings: roomTune("corridor", { shimmer: 0.18, wet: 0.2, hall: 0.32, air: 0.06, decay: 0.4, early: 0.7, diffusion: 0.1, absorption: 0.16, flutter: 0.8, modes: 0.3, airLoss: 0.36, slap: 0.74, bloom: 0.14, space: 0.12 }),
    ears: [
      ear(0.14, 0.5, 0.5, 0.04, 0.8, 0.8, 0.1),
      ear(0.48, 0.42, 0.46, 0.2, 0.7, 1.05, 0.12),
      ear(0.82, 0.56, 0.62, 3.05, 1.1, 0.6, 0.11),
    ],
    bowls: [
      b(110, 0.9, "gold", 0.3, 0.5, 0.82, 0.12, 0.28),
      b(165, 0.55, "gold", 0.48, 0.4, 0.66, 0.22, 0.8),
      b(220, 0.7, "emerald", 0.64, 0.58, 0.54, 0.18, 0.34),
      b(330, 0.42, "gold", 0.8, 0.46, 0.42, 0.3, 0.86),
    ],
  },
  {
    id: "chapel-close-far",
    name: "Chapel Close and Far",
    blurb: "Rose in the chapel. Ear 1 is in the glass with short cones. The stem at the door uses long cones, so the recording has a close and a room pair.",
    tags: ["Recording", "Chapel", "Close and room"],
    settings: roomTune("chapel", { shimmer: 0.34, wet: 0.22, hall: 0.34, air: 0.08, decay: 0.36, early: 0.86, diffusion: 0.32, absorption: 0.36, flutter: 0.1, modes: 0.18, airLoss: 0.14, slap: 0.2, bloom: 0.6, space: 0.34 }),
    ears: [
      ear(0.46, 0.48, 0.4, 0.4, 0.4, 0.45, 0.08),
      ear(0.8, 0.84, 0.58, 2.4, 1.3, 1.2, 0.18),
    ],
    bowls: [
      b(136.1, 0.92, "rose", 0.32, 0.4, 0.84, 0.14, 0.28),
      b(170, 0.5, "rose", 0.55, 0.55, 0.64, 0.28, 0.84),
      b(204, 0.7, "selenite", 0.28, 0.68, 0.52, 0.18, 0.36),
      b(272, 0.42, "rose", 0.66, 0.3, 0.42, 0.32, 0.78),
    ],
  },
  {
    id: "dome-overhead",
    name: "Dome Overhead",
    blurb: "A seated ear for listening, and a stem high in the dome with wide cones. The download keeps the overhead pair, including its height.",
    tags: ["Recording", "Dome", "Height stem"],
    settings: roomTune("dome", { loopMode: "breath", period: 22, shimmer: 0.5, wet: 0.3, hall: 0.62, air: 0.08, decay: 0.78, early: 0.32, diffusion: 0.9, absorption: 0.2, flutter: 0.05, modes: 0.46, airLoss: 0.14, slap: 0.12, bloom: 0.64, space: 0.74 }),
    ears: [
      ear(0.42, 0.62, 0.5, 0.3, 0.7, 0.7, 0.12),
      ear(0.5, 0.4, 0.96, 0.1, 1.45, 1.45, 0.2),
    ],
    bowls: [
      b(98, 0.9, "frosted", 0.36, 0.36, 0.8, 0.12, 0.3),
      b(123.47, 0.5, "selenite", 0.64, 0.42, 0.62, 0.26, 0.86),
      b(146.83, 0.72, "frosted", 0.48, 0.22, 0.54, 0.18, 0.34),
      b(196, 0.42, "aqua", 0.28, 0.55, 0.44, 0.3, 0.8),
    ],
  },
  {
    id: "cube-corners",
    name: "Cube Corners",
    blurb: "Four ears, one in each corner of a cube, cones aimed inward. You hear the front pair. The other three are stems for a corner recording.",
    tags: ["Recording", "Cube", "Four ears"],
    settings: roomTune("cube", { loopMode: "mallet", period: 12, shimmer: 0.1, wet: 0.2, hall: 0.3, air: 0.04, decay: 0.44, early: 0.66, diffusion: 0.12, absorption: 0.14, flutter: 0.55, modes: 0.84, airLoss: 0.18, slap: 0.26, bloom: 0.34, space: 0.2 }),
    ears: [
      ear(0.22, 0.78, 0.48, 0.7, 0.85, 0.85, 0.1),
      ear(0.78, 0.78, 0.48, -0.7, 0.85, 0.85, 0.1),
      ear(0.22, 0.22, 0.36, 2.3, 0.95, 0.7, 0.1),
      ear(0.78, 0.22, 0.62, -2.3, 0.7, 0.95, 0.1),
    ],
    bowls: [
      b(82.41, 0.92, "obsidian", 0.4, 0.5, 0.84, 0.1, 0.28),
      b(110, 0.58, "platinum", 0.6, 0.4, 0.66, 0.2, 0.7),
      b(164.81, 0.7, "quartz", 0.48, 0.66, 0.54, 0.16, 0.36),
      b(220, 0.42, "platinum", 0.32, 0.34, 0.4, 0.28, 0.88),
    ],
  },
  {
    id: "shoebox-ortf",
    name: "Shoebox ORTF",
    blurb: "A wide listening pair, cones splayed like an ORTF head, plus a stem behind you for the room. Frosted and gold in a shoebox.",
    tags: ["Recording", "Shoebox", "Wide pair"],
    settings: roomTune("shoebox", { shimmer: 0.26, wet: 0.24, hall: 0.5, air: 0.1, decay: 0.58, early: 0.72, diffusion: 0.4, absorption: 0.28, flutter: 0.18, modes: 0.22, airLoss: 0.2, slap: 0.16, bloom: 0.26, space: 0.7 }),
    ears: [
      ear(0.5, 0.7, 0.52, 0.08, 0.95, 0.95, 0.22),
      ear(0.5, 0.88, 0.58, 3.1, 1.2, 1.2, 0.14),
    ],
    bowls: [
      b(146.83, 0.88, "gold", 0.24, 0.4, 0.78, 0.14, 0.3),
      b(185, 0.52, "frosted", 0.72, 0.38, 0.62, 0.26, 0.82),
      b(220, 0.68, "gold", 0.4, 0.24, 0.54, 0.18, 0.34),
      b(277.18, 0.42, "frosted", 0.6, 0.58, 0.44, 0.3, 0.78),
      b(369.99, 0.4, "platinum", 0.3, 0.62, 0.36, 0.34, 0.9),
    ],
  },
  {
    id: "cave-trio",
    name: "Cave Trio",
    blurb: "Three heights in a cave: a low ear you hear, a seated stem, and a high stem. Obsidian stays in the floor pair. Phantom sits in the high cones.",
    tags: ["Recording", "Cave", "Three heights"],
    settings: roomTune("cave", { loopMode: "tide", period: 40, shimmer: 0.16, wet: 0.36, hall: 0.7, air: 0.3, decay: 0.92, early: 0.42, diffusion: 0.86, absorption: 0.9, flutter: 0.24, modes: 0.7, airLoss: 0.7, slap: 0.28, bloom: 0.88, space: 0.42 }),
    ears: [
      ear(0.36, 0.7, 0.22, 0.4, 1.1, 0.8, 0.12),
      ear(0.62, 0.55, 0.52, -0.5, 0.75, 0.9, 0.14),
      ear(0.48, 0.32, 0.9, 0.2, 1.3, 1.15, 0.16),
    ],
    bowls: [
      b(55, 1, "obsidian", 0.3, 0.48, 0.9, 0.08, 0.24),
      b(82.5, 0.64, "obsidian", 0.55, 0.66, 0.7, 0.14, 0.4),
      b(110, 0.5, "phantom", 0.72, 0.4, 0.55, 0.24, 0.86),
      b(165, 0.42, "phantom", 0.4, 0.28, 0.42, 0.3, 0.7),
    ],
  },
  {
    id: "gilded-tree",
    name: "Gilded Tree",
    blurb: "A Decca-style tree in the gilded hall. Ear 1 is the center pair you hear. A low stem and a high stem flank it for the recording.",
    tags: ["Recording", "Gilded hall", "Decca tree"],
    settings: roomTune("gilded", { shimmer: 0.38, wet: 0.28, hall: 0.74, air: 0.12, decay: 0.86, early: 0.58, diffusion: 0.52, absorption: 0.22, flutter: 0.1, modes: 0.2, airLoss: 0.26, slap: 0.18, bloom: 0.46, space: 0.9 }),
    ears: [
      ear(0.5, 0.62, 0.58, 0.12, 0.8, 0.8, 0.18),
      ear(0.34, 0.5, 0.28, 0.35, 1.15, 0.7, 0.12),
      ear(0.66, 0.5, 0.86, -0.3, 0.7, 1.2, 0.12),
    ],
    bowls: [
      b(98, 0.94, "gold", 0.28, 0.32, 0.82, 0.12, 0.28),
      b(146.83, 0.58, "platinum", 0.7, 0.36, 0.66, 0.22, 0.74),
      b(196, 0.74, "gold", 0.46, 0.22, 0.56, 0.16, 0.34),
      b(246.94, 0.46, "emerald", 0.32, 0.55, 0.46, 0.26, 0.82),
      b(293.66, 0.4, "platinum", 0.64, 0.62, 0.38, 0.32, 0.4),
    ],
  },
  {
    id: "ellipse-surround",
    name: "Ellipse Surround",
    blurb: "A pentatonic ellipse with four ears. You hear the front pair. Three stems circle the glass, each with its own cone size, for a surround recording.",
    tags: ["Recording", "Ellipse", "Surround"],
    settings: roomTune("ellipse", { shimmer: 0.3, wet: 0.22, hall: 0.46, air: 0.1, decay: 0.6, early: 0.5, diffusion: 0.66, absorption: 0.3, flutter: 0.12, modes: 0.24, airLoss: 0.22, slap: 0.16, bloom: 0.34, space: 0.78 }),
    ears: [
      ear(0.5, 0.82, 0.54, 0.08, 0.75, 0.75, 0.13),
      ear(0.18, 0.5, 0.48, 1.5, 1.05, 0.6, 0.12),
      ear(0.82, 0.5, 0.48, -1.5, 0.6, 1.05, 0.12),
      ear(0.5, 0.18, 0.7, 3.14, 1.2, 1.2, 0.15),
    ],
    bowls: [
      b(110, 0.88, "quartz", 0.4, 0.42, 0.8, 0.12, 0.3),
      b(123.47, 0.5, "aqua", 0.62, 0.38, 0.62, 0.26, 0.8),
      b(146.83, 0.7, "emerald", 0.5, 0.58, 0.56, 0.18, 0.34),
      b(164.81, 0.44, "gold", 0.32, 0.62, 0.46, 0.3, 0.86),
      b(220, 0.4, "phantom", 0.7, 0.6, 0.38, 0.28, 0.42),
    ],
  },
  {
    id: "crown-of-eight",
    name: "Crown of Eight",
    blurb: "A full ring of stems in the rotunda. You hear the front pair. The other seven are a download: each height and cone size is its own left and right around a gold and rose chord.",
    tags: ["Premium", "Download", "All stems"],
    download: true,
    settings: roomTune("rotunda", { shimmer: 0.42, wet: 0.26, hall: 0.62, air: 0.14, decay: 0.7, early: 0.55, diffusion: 0.64, absorption: 0.28, flutter: 0.08, modes: 0.16, airLoss: 0.18, slap: 0.1, bloom: 0.5, space: 0.84 }),
    ears: stemRing(0.32, -Math.PI / 2),
    bowls: [
      b(110, 0.92, "rose", 0.5, 0.46, 0.84, 0.12, 0.28),
      b(138.59, 0.56, "gold", 0.36, 0.38, 0.66, 0.2, 0.7),
      b(164.81, 0.7, "selenite", 0.64, 0.4, 0.54, 0.16, 0.34),
      b(220, 0.48, "quartz", 0.42, 0.58, 0.48, 0.28, 0.82),
      b(277.18, 0.42, "emerald", 0.58, 0.6, 0.4, 0.3, 0.46),
      b(329.63, 0.38, "platinum", 0.5, 0.32, 0.34, 0.32, 0.88),
    ],
  },
  {
    id: "octagon-array",
    name: "Octagon Array",
    blurb: "Eight stems, one toward each wall of the octagon. Canon keeps them from locking. Obsidian holds the floor; platinum and frosted sit higher for the file.",
    tags: ["Premium", "Download", "Octagon"],
    download: true,
    settings: roomTune("octagon", { loopMode: "canon", period: 16, shimmer: 0.18, wet: 0.2, hall: 0.48, air: 0.08, decay: 0.55, early: 0.46, diffusion: 0.4, absorption: 0.24, flutter: 0.18, modes: 0.34, airLoss: 0.16, slap: 0.22, bloom: 0.3, space: 0.7 }),
    ears: stemRing(0.36, 0.2),
    bowls: [
      b(73.42, 1, "obsidian", 0.48, 0.5, 0.88, 0.08, 0.26),
      b(110, 0.62, "obsidian", 0.34, 0.42, 0.7, 0.14, 0.4),
      b(146.83, 0.54, "frosted", 0.66, 0.44, 0.58, 0.22, 0.78),
      b(196, 0.72, "gold", 0.5, 0.34, 0.52, 0.16, 0.32),
      b(246.94, 0.46, "platinum", 0.4, 0.62, 0.44, 0.28, 0.84),
      b(293.66, 0.4, "frosted", 0.6, 0.64, 0.38, 0.3, 0.5),
      b(369.99, 0.36, "platinum", 0.52, 0.28, 0.32, 0.34, 0.9),
    ],
  },
  {
    id: "canopy-record",
    name: "Canopy Record",
    blurb: "A dome with every stem, from the floor pair you hear up to a high canopy. Tide moves the glass. Aqua, emerald, and phantom are written into the upper cones.",
    tags: ["Premium", "Download", "Dome"],
    download: true,
    settings: roomTune("dome", { loopMode: "tide", period: 36, shimmer: 0.34, wet: 0.3, hall: 0.66, air: 0.2, decay: 0.78, early: 0.4, diffusion: 0.72, absorption: 0.34, flutter: 0.06, modes: 0.14, airLoss: 0.28, slap: 0.08, bloom: 0.62, space: 0.8 }),
    ears: stemRing(0.28, 0.6),
    bowls: [
      b(98, 0.96, "quartz", 0.46, 0.48, 0.86, 0.1, 0.24),
      b(130.81, 0.6, "aqua", 0.34, 0.36, 0.64, 0.22, 0.74),
      b(164.81, 0.74, "emerald", 0.64, 0.4, 0.56, 0.16, 0.36),
      b(196, 0.5, "aqua", 0.5, 0.62, 0.46, 0.24, 0.82),
      b(261.63, 0.42, "phantom", 0.4, 0.58, 0.4, 0.3, 0.88),
      b(329.63, 0.38, "emerald", 0.6, 0.3, 0.34, 0.28, 0.48),
    ],
  },
];

const MALLET: GongId[] = ["felt", "wood", "rubber", "suede", "brass"];

function mix(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return hash;
}

/** Give every house preset a head tilt, two different horn aims, and a mallet on the first bowl. */
function upgradeHouse(preset: Preset): Preset {
  const salt = mix(preset.id);
  const ears = (preset.ears ?? []).map((item, index) => {
    const n = (salt + index * 19) % 7;
    const spread = item.left?.x != null ? Math.abs(item.left.x) : 0.14;
    return {
      ...item,
      pitch: item.pitch ?? Math.round((0.18 + n * 0.07) * 100) / 100,
      left: {
        x: -spread,
        y: 0.02,
        z: 0.05,
        gain: 1,
        size: 0.72,
        ...item.left,
        pitch: item.left?.pitch ?? Math.round((-0.7 + (n % 3) * 0.32) * 100) / 100,
      },
      right: {
        x: spread,
        y: 0.02,
        z: 0.05,
        gain: 1,
        size: 0.72,
        ...item.right,
        pitch: item.right?.pitch ?? Math.round((0.12 + (n % 4) * 0.2) * 100) / 100,
      },
    };
  });
  const bowls = preset.bowls.map((bowl, index) => (index === 0 && !bowl.gong ? { ...bowl, gong: MALLET[salt % MALLET.length]! } : bowl));
  const tags = preset.tags.includes("Horns") ? preset.tags : [...preset.tags, "Horns"];
  return { ...preset, ears, bowls, tags, source: "house" };
}

const PHASE: Preset[] = [
  {
    id: "slow-bleed",
    name: "Slow Bleed",
    blurb: "A quarter-hertz binaural bed under a high ear. The left mouth points at the ceiling of the ellipse. The right mouth points at the floor glass. Tide pulls the chord while the two channels bleed past each other.",
    tags: ["Listening", "Ellipse", "Phasing", "Binaural", "Split horns", "Tide", "High ear"],
    settings: roomTune("ellipse", {
      loopMode: "tide",
      period: 33,
      veil: 0.36,
      veilHz: 0.14,
      shimmer: 0.22,
      wet: 0.24,
      hall: 0.58,
      air: 0.16,
      decay: 0.74,
      early: 0.4,
      diffusion: 0.7,
      absorption: 0.3,
      flutter: 0.08,
      modes: 0.22,
      airLoss: 0.34,
      slap: 0.12,
      bloom: 0.55,
      space: 0.88,
      binaural: true,
      binauralCarrier: 96,
      binauralBeat: 0.25,
      binauralLevel: 0.62,
    }),
    ears: [phase(0.58, 0.62, 2.6, 0.2, 0.35, -1.15, 1.12, 1.25, 0.55, 0.18, 0.95, 0.7, -0.2, 0.25)],
    bowls: [
      b(96, 0.96, "obsidian", 0.4, 0.48, 0.86, 0.1, 0.26, "felt"),
      b(128, 0.58, "aqua", 0.62, 0.34, 0.62, 0.2, 0.72),
      b(144.2, 0.7, "phantom", 0.32, 0.66, 0.5, 0.16, 0.88, "wood"),
      b(192.35, 0.44, "selenite", 0.7, 0.58, 0.4, 0.28, 0.4),
    ],
  },
  {
    id: "counterspin",
    name: "Counterspin",
    blurb: "Every second and a quarter the ear steps around a rotunda. The left horn always faces one way around the circle and the right horn faces the other, so the stereo image spins instead of sitting still.",
    tags: ["Listening", "Rotunda", "Phasing", "Cycle", "Split horns"],
    cycle: { on: true, seconds: 1.25 },
    settings: roomTune("rotunda", {
      loopMode: "breath",
      period: 14,
      veil: 0.22,
      veilHz: 0.55,
      shimmer: 0.32,
      wet: 0.2,
      hall: 0.46,
      air: 0.08,
      decay: 0.52,
      early: 0.48,
      diffusion: 0.66,
      absorption: 0.22,
      flutter: 0.06,
      modes: 0.12,
      airLoss: 0.16,
      slap: 0.1,
      bloom: 0.3,
      space: 0.78,
    }),
    ears: [
      phase(0.5, 0.78, 0.7, 0.05, 0.2, 0.15, 0.15, 0.9, 0.9, 0.14, 1, 1, 0.95, -0.95),
      phase(0.78, 0.5, 1.15, 1.57, 0.35, -0.4, 0.55, 1.1, 0.65, 0.15, 0.8, 1, 0.95, -0.95),
      phase(0.5, 0.22, 1.7, 3.14, 0.5, 0.7, -0.85, 0.6, 1.25, 0.16, 1, 0.75, 0.95, -0.95),
      phase(0.22, 0.5, 2.3, -1.57, 0.28, -1.0, 0.4, 1.3, 0.5, 0.14, 0.7, 1, 0.95, -0.95),
    ],
    bowls: [
      b(146.83, 0.88, "gold", 0.5, 0.32, 0.8, 0.14, 0.3, "suede"),
      b(183.54, 0.5, "emerald", 0.68, 0.5, 0.62, 0.26, 0.78, "brass"),
      b(220.25, 0.66, "gold", 0.42, 0.66, 0.5, 0.18, 0.36),
      b(293.66, 0.4, "platinum", 0.3, 0.42, 0.4, 0.3, 0.88, "wood"),
    ],
  },
  {
    id: "veil-split",
    name: "Veil Split",
    blurb: "A strong slow veil under a dome. The left cone is huge and down among the bowls. The right cone is small and up in the dome, so one channel is the glass and the other is the room. A two-hertz binaural beat ticks between them.",
    tags: ["Listening", "Dome", "Phasing", "Veil", "Binaural", "Split horns", "High ear"],
    settings: roomTune("dome", {
      loopMode: "breath",
      period: 22,
      veil: 0.58,
      veilHz: 0.18,
      shimmer: 0.44,
      wet: 0.3,
      hall: 0.7,
      air: 0.08,
      decay: 0.82,
      early: 0.36,
      diffusion: 0.9,
      absorption: 0.2,
      flutter: 0.06,
      modes: 0.4,
      airLoss: 0.18,
      slap: 0.2,
      bloom: 0.66,
      space: 0.74,
      binaural: true,
      binauralCarrier: 140,
      binauralBeat: 2,
      binauralLevel: 0.48,
    }),
    ears: [phase(0.48, 0.55, 1.9, 0.35, 0.45, 1.05, -1.1, 1.6, 0.36, 0.17, 1, 0.42, 0.1, -0.15)],
    bowls: [
      b(98, 0.94, "frosted", 0.46, 0.62, 0.84, 0.12, 0.26, "felt"),
      b(122.5, 0.5, "selenite", 0.66, 0.4, 0.6, 0.24, 0.84),
      b(147.2, 0.72, "aqua", 0.32, 0.36, 0.5, 0.18, 0.4, "wood"),
      b(196, 0.42, "frosted", 0.58, 0.24, 0.4, 0.3, 0.9),
    ],
  },
  {
    id: "crossfade-nave",
    name: "Crossfade Nave",
    blurb: "Three seats down a nave, six and a half seconds apart. The near seat is almost all left. The middle seat is almost all right and higher. The far seat is up near the ceiling with the horns aimed opposite ways. A canon crosses that walk.",
    tags: ["Listening", "Nave", "Phasing", "Cycle", "Canon", "High ear", "Split horns"],
    cycle: { on: true, seconds: 6.5 },
    settings: roomTune("nave", {
      loopMode: "canon",
      period: 26,
      shimmer: 0.34,
      wet: 0.32,
      hall: 0.78,
      air: 0.16,
      decay: 0.9,
      early: 0.5,
      diffusion: 0.42,
      absorption: 0.18,
      flutter: 0.22,
      modes: 0.32,
      airLoss: 0.4,
      slap: 0.7,
      bloom: 0.38,
      space: 0.8,
      veil: 0.18,
      veilHz: 0.26,
    }),
    ears: [
      phase(0.5, 0.86, 0.48, 0.04, 0.15, 0.25, 0.7, 1.15, 0.45, 0.13, 1, 0.32, 0.05, 0.4),
      phase(0.46, 0.52, 1.65, 0.1, 0.4, -0.55, 0.35, 0.5, 1.4, 0.15, 0.34, 1, -0.45, 0.1),
      phase(0.54, 0.2, 3.1, -0.15, 0.7, -0.95, 1.05, 0.85, 1.2, 0.16, 0.8, 0.75, 0.65, -0.7),
    ],
    bowls: [
      b(108, 0.96, "quartz", 0.22, 0.5, 0.82, 0.1, 0.28, "felt"),
      b(144, 0.58, "gold", 0.4, 0.42, 0.66, 0.2, 0.8, "wood"),
      b(180.3, 0.74, "platinum", 0.58, 0.58, 0.54, 0.16, 0.34),
      b(216, 0.46, "aqua", 0.74, 0.4, 0.44, 0.28, 0.86, "brass"),
      b(288.4, 0.4, "quartz", 0.86, 0.56, 0.34, 0.24, 0.42),
    ],
  },
  {
    id: "beat-walk",
    name: "Beat Walk",
    blurb: "Each fifth has a twin a fraction sharp. The left horn is aimed at the flat bowl and the right horn at the sharp one, then the ear walks and the pairing flips. You hear the beat move from one channel to the other.",
    tags: ["Listening", "Fan hall", "Phasing", "Cycle", "Binaural", "Split horns", "Beats"],
    cycle: { on: true, seconds: 3.5 },
    settings: roomTune("fan", {
      shimmer: 0.14,
      wet: 0.18,
      hall: 0.34,
      air: 0.06,
      decay: 0.46,
      early: 0.8,
      diffusion: 0.24,
      absorption: 0.22,
      flutter: 0.12,
      modes: 0.14,
      airLoss: 0.22,
      slap: 0.2,
      bloom: 0.16,
      space: 0.92,
      veil: 0.28,
      veilHz: 0.33,
      binaural: true,
      binauralCarrier: 110,
      binauralBeat: 0.8,
      binauralLevel: 0.4,
    }),
    ears: [
      phase(0.42, 0.22, 0.6, 0.15, 0.2, 0.1, 0.15, 1.05, 0.7, 0.12, 1, 0.85, -0.55, 0.6),
      phase(0.5, 0.48, 1.25, 0.2, 0.4, -0.6, 0.85, 0.55, 1.3, 0.14, 0.7, 1, 0.5, -0.65),
      phase(0.46, 0.74, 1.85, -0.1, 0.55, 0.75, -0.9, 1.2, 0.48, 0.15, 0.9, 0.55, -0.4, 0.7),
    ],
    bowls: [
      b(110, 0.9, "phantom", 0.3, 0.7, 0.78, 0.12, 0.3, "felt"),
      b(110.42, 0.48, "quartz", 0.55, 0.82, 0.6, 0.22, 0.86),
      b(165, 0.72, "phantom", 0.68, 0.62, 0.62, 0.16, 0.34, "wood"),
      b(165.5, 0.42, "selenite", 0.4, 0.5, 0.5, 0.28, 0.78),
      b(220, 0.6, "platinum", 0.72, 0.4, 0.42, 0.2, 0.42, "brass"),
      b(220.45, 0.38, "aqua", 0.34, 0.36, 0.36, 0.3, 0.9),
    ],
  },
];

function shell(
  x: number,
  y: number,
  size: number,
  height: number,
  glass: GlassId,
  frequency: number,
  reflect: number,
  diffuse: number,
  brightness: number,
): PresetDome {
  return { x, y, size, height, glass, frequency, reflect, diffuse, brightness };
}

const DOME_PRESETS: Preset[] = [
  {
    id: "hall-canopy",
    name: "Hall Canopy",
    blurb: "One shell as wide as the hall. Everything that rises comes back down over the middle, late and wide.",
    tags: ["New", "Dome", "Hall", "Canopy"],
    settings: roomTune("shoebox", { shimmer: 0.34, wet: 0.26, hall: 0.72, decay: 0.7, bloom: 0.62, diffusion: 0.7, space: 0.9 }),
    ears: [phase(0.5, 0.62, 0.85, 0.05, 0.15, -1.05, -0.95, 1.15, 1.15, 0.16)],
    domes: [shell(0.5, 0.5, DOME_SIZE_MAX, 2.4, "gold", 146.83, 0.84, 0.62, 0.55)],
    bowls: [
      b(110, 0.92, "gold", 0.28, 0.42, 0.8, 0.12, 0.3, "felt"),
      b(146.83, 0.7, "rose", 0.5, 0.48, 0.72, 0.18, 0.42),
      b(196, 0.55, "selenite", 0.7, 0.38, 0.58, 0.22, 0.7, "brass"),
      b(220, 0.46, "frosted", 0.4, 0.66, 0.48, 0.16, 0.55),
    ],
  },
  {
    id: "note-cup",
    name: "Note Cup",
    blurb: "A tight bright cup over one bowl. The return is almost the same note, aimed into the horns.",
    tags: ["New", "Dome", "Focus"],
    settings: roomTune("chapel", { shimmer: 0.22, wet: 0.18, hall: 0.28, decay: 0.32, diffusion: 0.24, absorption: 0.4 }),
    ears: [phase(0.58, 0.72, 0.7, 0.2, 0.35, -0.85, -0.7, 0.95, 0.8, 0.12)],
    domes: [shell(0.38, 0.42, 0.72, 1.15, "platinum", 196, 0.94, 0.08, 0.9)],
    bowls: [
      b(196, 0.84, "platinum", 0.38, 0.42, 0.86, 0.14, 0.36, "brass"),
      b(246.94, 0.48, "selenite", 0.66, 0.58, 0.42, 0.2, 0.62),
      b(293.66, 0.4, "aqua", 0.24, 0.7, 0.36, 0.18, 0.8),
    ],
  },
  {
    id: "split-return",
    name: "Split Return",
    blurb: "Two domes, a fifth apart. The left horn takes the low shell. The right horn takes the high one.",
    tags: ["New", "Dome", "Phasing"],
    settings: roomTune("shoebox", { shimmer: 0.4, wet: 0.22, hall: 0.48, decay: 0.55, diffusion: 0.4 }),
    ears: [phase(0.5, 0.78, 0.9, 0, 0.2, -0.9, -0.75, 1.05, 0.85, 0.2, 1, 1, -0.45, 0.5)],
    domes: [
      shell(0.32, 0.46, 1.15, 1.55, "rose", 146.83, 0.88, 0.16, 0.62),
      shell(0.7, 0.44, 1.05, 1.85, "aqua", 220, 0.86, 0.18, 0.84),
    ],
    bowls: [
      b(146.83, 0.8, "rose", 0.32, 0.46, 0.78, 0.14, 0.34, "wood"),
      b(220, 0.62, "aqua", 0.7, 0.44, 0.7, 0.2, 0.58, "brass"),
      b(174.61, 0.5, "selenite", 0.5, 0.62, 0.46, 0.16, 0.72),
    ],
  },
  {
    id: "late-ceiling",
    name: "Late Ceiling",
    blurb: "A dark shell hung at the top of the hall. The bounce arrives late, and the horns look up to meet it.",
    tags: ["New", "Dome", "Height", "Late"],
    settings: roomTune("shoebox", { shimmer: 0.18, wet: 0.2, hall: 0.8, decay: 0.84, absorption: 0.22, air: 0.16, bloom: 0.4 }),
    ears: [phase(0.48, 0.7, 0.55, 0.1, 0.05, -1.15, -1.1, 1.25, 1.2, 0.14)],
    domes: [shell(0.5, 0.42, 1.6, 3.05, "obsidian", 110, 0.92, 0.12, 0.28)],
    bowls: [
      b(110, 0.94, "obsidian", 0.46, 0.4, 0.84, 0.1, 0.28, "felt"),
      b(164.81, 0.66, "phantom", 0.28, 0.58, 0.6, 0.16, 0.48),
      b(220, 0.48, "gold", 0.68, 0.56, 0.5, 0.22, 0.7, "suede"),
    ],
  },
  {
    id: "soft-frost",
    name: "Soft Frost",
    blurb: "A frosted canopy spreads the return instead of focusing it. Highs soften. The room under it stays one wash.",
    tags: ["New", "Dome", "Diffuse"],
    settings: roomTune("nave", { shimmer: 0.3, wet: 0.24, hall: 0.5, decay: 0.6, diffusion: 0.86, absorption: 0.46, airLoss: 0.34 }),
    ears: [phase(0.52, 0.74, 1.05, 0.08, 0.25, -0.55, -0.4, 0.8, 0.75, 0.16)],
    domes: [shell(0.5, 0.48, 2.4, 1.7, "frosted", 174.61, 0.7, 0.9, 0.32)],
    bowls: [
      b(130.81, 0.86, "frosted", 0.34, 0.4, 0.74, 0.12, 0.32),
      b(174.61, 0.64, "phantom", 0.52, 0.52, 0.66, 0.18, 0.5, "suede"),
      b(196, 0.5, "aqua", 0.68, 0.36, 0.5, 0.2, 0.74),
      b(261.63, 0.42, "selenite", 0.4, 0.66, 0.4, 0.24, 0.86),
    ],
  },
];

export const PRESETS: Preset[] = [...HOUSE.map(upgradeHouse), ...PHASE.map(upgradeHouse), ...AI_PRESETS, ...DOME_PRESETS];

export const PRESET_TAGS: string[] = [...new Set(PRESETS.flatMap((preset) => preset.tags))].sort((a, b) => a.localeCompare(b));

export const DEFAULT_PRESET_ID = "heart-chamber";

const PRESET_MAP = new Map(PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(id: string | null): Preset | undefined {
  if (!id) return undefined;
  return PRESET_MAP.get(id);
}

export function instantiatePreset(id: string): {
  bowls: Bowl[];
  settingsPatch: Partial<MusicalSettings>;
  preset: Preset;
  ears: Ear[];
  domes: ReturnType<typeof freshDome>[];
} {
  const preset = PRESET_MAP.get(id) ?? PRESETS[0]!;
  const shape = preset.settings.roomShape ?? "rotunda";
  const specs: PresetEar[] = preset.ears?.length
    ? preset.ears
    : [preset.receiver ?? { x: 0.62, y: 0.78, height: 0.55, yaw: 0.4 }];
  return {
    preset,
    settingsPatch: { ...roomPatch(shape), ...preset.settings, roomShape: shape },
    bowls: preset.bowls.map((bowl, index) => ({
      ...bowl,
      id: `${preset.id}-${index}`,
      muted: false,
    })),
    ears: specs.slice(0, MAX_EARS).map((spec, index) => makeEar(spec, `ear-${index + 1}`, spec.left, spec.right)),
    domes: (preset.domes ?? []).slice(0, MAX_DOMES).map((dome, index) => freshDome({ ...dome, id: `${preset.id}-dome-${index + 1}` })),
  };
}

const seen = new Set<string>();
if (PRESETS.length !== 66) throw new Error(`expected 66 presets, got ${PRESETS.length}`);
for (const preset of PRESETS) {
  if (seen.has(preset.id)) throw new Error(`duplicate preset ${preset.id}`);
  seen.add(preset.id);
  if (preset.bowls.length < MIN_BOWLS || preset.bowls.length > MAX_BOWLS) {
    throw new Error(`Preset ${preset.id} has ${preset.bowls.length} bowls`);
  }
  if (!preset.settings.roomShape) throw new Error(`Preset ${preset.id} needs a room`);
  if (!preset.ears || preset.ears.length < 1 || preset.ears.length > MAX_EARS) {
    throw new Error(`Preset ${preset.id} needs ears`);
  }
  if (preset.download && preset.ears.length !== MAX_EARS) {
    throw new Error(`Preset ${preset.id} should use every stem`);
  }
}
const downloads = PRESETS.filter((preset) => preset.download);
if (downloads.length < 3) throw new Error(`expected at least 3 download presets, got ${downloads.length}`);
const ai = PRESETS.filter((preset) => preset.source === "ai");
if (ai.length !== 20) throw new Error(`expected 20 AI presets, got ${ai.length}`);
