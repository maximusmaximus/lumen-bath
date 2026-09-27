import type { Bowl, MusicalSettings, Preset, PresetBowl, Settings } from "@/lib/audio/types";
import { MAX_BOWLS, MIN_BOWLS } from "@/lib/audio/types";

export const DEFAULT_MUSIC: MusicalSettings = {
  loopMode: "continuous",
  period: 24,
  veil: 0,
  veilHz: 0.45,
  shimmer: 0.28,
  width: 0.78,
  depth: 0.32,
  binaural: false,
  binauralCarrier: 128,
  binauralBeat: 1,
  binauralLevel: 0.4,
  wet: 0.16,
  hall: 0.4,
  air: 0.12,
  transpose: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_MUSIC,
  volume: 0.84,
  awake: false,
  output: "direct",
};

const b = (
  frequency: number,
  size: number,
  glass: PresetBowl["glass"],
  x: number,
  y: number,
  gain = 0.78,
  sing = 0.28,
): PresetBowl => ({ frequency, size, glass, x, y, gain, sing });

export const PRESETS: Preset[] = [
  {
    id: "heart-chamber",
    name: "Heart Chamber",
    blurb: "Om at 136.1 Hz with a twin a fraction sharp, so the beat is written into the glass, plus the fifth and octave.",
    tags: ["Rose quartz", "Composed beat", "Sustain"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.34, wet: 0.18, hall: 0.46, width: 0.7, air: 0.1 },
    bowls: [
      b(136.1, 0.92, "rose", 0.3, 0.56, 0.86, 0.22),
      b(136.52, 0.74, "rose", 0.52, 0.34, 0.72, 0.26),
      b(204.15, 0.64, "rose", 0.2, 0.7, 0.64, 0.3),
      b(272.2, 0.52, "selenite", 0.66, 0.6, 0.52, 0.34),
      b(340.25, 0.42, "rose", 0.42, 0.18, 0.46, 0.38),
    ],
  },
  {
    id: "still-water",
    name: "Still Water",
    blurb: "Three clear-quartz fifths from A2. Nothing extra — the reference for how clean the bath can be.",
    tags: ["Clear quartz", "Just fifths", "Sustain"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.12, wet: 0.1, hall: 0.28, width: 0.66, depth: 0.22, air: 0.04 },
    bowls: [
      b(110, 0.94, "quartz", 0.32, 0.58, 0.84, 0.16),
      b(165, 0.7, "quartz", 0.56, 0.4, 0.7, 0.22),
      b(220, 0.52, "quartz", 0.42, 0.74, 0.56, 0.26),
    ],
  },
  {
    id: "void-glass",
    name: "Void Glass",
    blurb: "64, 96, and 128 Hz — a 2:3:4 stack. Almost no hall, so the sine is the whole event.",
    tags: ["Clear quartz", "Sub fifths", "Dry"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.05, wet: 0.045, hall: 0.18, width: 0.55, depth: 0.12, air: 0 },
    bowls: [
      b(64, 1, "quartz", 0.34, 0.56, 0.9, 0.08),
      b(96, 0.78, "quartz", 0.54, 0.4, 0.72, 0.12),
      b(128, 0.6, "quartz", 0.44, 0.74, 0.58, 0.16),
    ],
  },
  {
    id: "golden-lattice",
    name: "Golden Lattice",
    blurb: "Scientific pitch from 128 Hz: unison, fifth, octave, tenth, and twelfth. Just intonation, warm gold.",
    tags: ["Gold alchemy", "5-limit", "Sustain"],
    settings: { loopMode: "continuous", veil: 0.12, veilHz: 0.3, shimmer: 0.4, wet: 0.16, hall: 0.4, width: 0.8 },
    bowls: [
      b(128, 0.92, "gold", 0.28, 0.62, 0.82, 0.2),
      b(192, 0.74, "gold", 0.46, 0.38, 0.7, 0.24),
      b(256, 0.58, "gold", 0.62, 0.56, 0.58, 0.28),
      b(320, 0.48, "platinum", 0.38, 0.24, 0.48, 0.34),
      b(384, 0.4, "gold", 0.7, 0.34, 0.42, 0.36),
    ],
  },
  {
    id: "moon-pool",
    name: "Moon Pool",
    blurb: "Just pentatonic on G2 — 1, 9/8, 5/4, 3/2, 5/3 — under a shared breath.",
    tags: ["Frosted", "Pentatonic", "Breath 22s"],
    settings: { loopMode: "breath", period: 22, veil: 0.1, veilHz: 0.28, shimmer: 0.32, wet: 0.2, hall: 0.5, width: 0.82 },
    bowls: [
      b(98, 0.9, "frosted", 0.3, 0.6, 0.84, 0.24),
      b(110.25, 0.72, "frosted", 0.48, 0.36, 0.68, 0.28),
      b(122.5, 0.64, "selenite", 0.64, 0.52, 0.6, 0.3),
      b(147, 0.54, "frosted", 0.4, 0.76, 0.54, 0.32),
      b(163.33, 0.46, "aqua", 0.58, 0.22, 0.46, 0.36),
    ],
  },
  {
    id: "temple-dawn",
    name: "Temple Dawn",
    blurb: "Multiples of 36 Hz up to 432. A wide, consonant morning stack with platinum on the smaller bowls.",
    tags: ["432 family", "Seven bowls", "Sustain"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.42, wet: 0.17, hall: 0.44, width: 0.88, depth: 0.4 },
    bowls: [
      b(108, 0.96, "quartz", 0.22, 0.62, 0.8, 0.18),
      b(144, 0.8, "quartz", 0.36, 0.4, 0.7, 0.22),
      b(180, 0.68, "gold", 0.5, 0.66, 0.62, 0.26),
      b(216, 0.58, "platinum", 0.64, 0.36, 0.54, 0.3),
      b(288, 0.48, "platinum", 0.32, 0.24, 0.46, 0.34),
      b(360, 0.4, "aqua", 0.7, 0.56, 0.4, 0.38),
      b(432, 0.36, "platinum", 0.52, 0.18, 0.36, 0.42),
    ],
  },
  {
    id: "deep-earth",
    name: "Deep Earth",
    blurb: "Obsidian fifths from A1. A long tide — slow rise, shorter fall — and a larger hall behind them.",
    tags: ["Obsidian", "Low fifths", "Tide 40s"],
    settings: { loopMode: "tide", period: 40, veil: 0, shimmer: 0.16, wet: 0.28, hall: 0.62, width: 0.9, depth: 0.45, air: 0.28 },
    bowls: [
      b(55, 1, "obsidian", 0.34, 0.58, 0.9, 0.1),
      b(82.5, 0.82, "obsidian", 0.56, 0.4, 0.74, 0.14),
      b(110, 0.66, "obsidian", 0.26, 0.74, 0.62, 0.18),
      b(165, 0.5, "gold", 0.64, 0.7, 0.5, 0.22),
    ],
  },
  {
    id: "aurora-veil",
    name: "Aurora Veil",
    blurb: "G major just tones, two of them twinned for a slow acoustic beat, with aqua partials on top.",
    tags: ["Aqua aura", "Twin beats", "Breath 18s"],
    settings: { loopMode: "breath", period: 18, veil: 0, shimmer: 0.62, wet: 0.22, hall: 0.48, width: 0.86, air: 0.06 },
    bowls: [
      b(196, 0.74, "aqua", 0.3, 0.48, 0.76, 0.3),
      b(196.33, 0.62, "aqua", 0.42, 0.34, 0.62, 0.34),
      b(245, 0.56, "platinum", 0.58, 0.5, 0.58, 0.36),
      b(294, 0.5, "aqua", 0.24, 0.7, 0.52, 0.32),
      b(294.4, 0.44, "selenite", 0.66, 0.68, 0.46, 0.38),
      b(392, 0.38, "aqua", 0.48, 0.22, 0.4, 0.44),
    ],
  },
  {
    id: "crystal-choir",
    name: "Crystal Choir",
    blurb: "Nine-note just major scale from C3 through the tenth. Each voice is quiet so the chord, not a solo, sings.",
    tags: ["Just major", "Nine bowls", "Sustain"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.3, wet: 0.14, hall: 0.38, width: 0.92, depth: 0.36, air: 0.08 },
    bowls: [
      b(130.81, 0.88, "quartz", 0.2, 0.58, 0.7, 0.18),
      b(147.16, 0.72, "frosted", 0.32, 0.36, 0.58, 0.22),
      b(163.51, 0.66, "quartz", 0.46, 0.68, 0.56, 0.24),
      b(174.41, 0.6, "selenite", 0.58, 0.32, 0.5, 0.26),
      b(196.22, 0.54, "frosted", 0.7, 0.56, 0.48, 0.28),
      b(218.02, 0.48, "rose", 0.28, 0.22, 0.44, 0.3),
      b(245.27, 0.44, "platinum", 0.62, 0.78, 0.4, 0.32),
      b(261.62, 0.4, "quartz", 0.4, 0.16, 0.38, 0.34),
      b(327.03, 0.36, "aqua", 0.74, 0.28, 0.34, 0.4),
    ],
  },
  {
    id: "interference-garden",
    name: "Interference Garden",
    blurb: "Four just fifths, each with a twin a third of a hertz sharp. Beats you can count. Hall stays low so they stay sharp.",
    tags: ["Phantom", "0.3 Hz beats", "Dry"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.18, wet: 0.08, hall: 0.24, width: 0.84, depth: 0.2, air: 0.05 },
    bowls: [
      b(110, 0.9, "phantom", 0.28, 0.42, 0.78, 0.18),
      b(110.32, 0.74, "quartz", 0.4, 0.32, 0.64, 0.2),
      b(165, 0.7, "phantom", 0.58, 0.46, 0.66, 0.22),
      b(165.36, 0.58, "quartz", 0.7, 0.34, 0.54, 0.24),
      b(220, 0.52, "phantom", 0.26, 0.68, 0.56, 0.26),
      b(220.33, 0.44, "selenite", 0.4, 0.76, 0.48, 0.28),
      b(330, 0.4, "phantom", 0.58, 0.72, 0.42, 0.32),
      b(330.4, 0.36, "platinum", 0.72, 0.6, 0.36, 0.34),
    ],
  },
  {
    id: "night-ocean",
    name: "Night Ocean",
    blurb: "D and A in the low register, selenite over a long tide. The wettest preset — still a tone, not a wash.",
    tags: ["Selenite", "Tide 48s", "Wide hall"],
    settings: { loopMode: "tide", period: 48, veil: 0.08, veilHz: 0.22, shimmer: 0.22, wet: 0.34, hall: 0.72, width: 0.94, depth: 0.5, air: 0.22 },
    bowls: [
      b(73.42, 0.98, "selenite", 0.34, 0.56, 0.86, 0.12),
      b(110, 0.76, "frosted", 0.54, 0.38, 0.7, 0.18),
      b(146.83, 0.62, "selenite", 0.24, 0.74, 0.58, 0.2),
      b(220, 0.46, "aqua", 0.66, 0.68, 0.46, 0.28),
    ],
  },
  {
    id: "solaris",
    name: "Solaris",
    blurb: "D major in just intonation, gold and emerald. A light veil lays a slow shadow on every bowl.",
    tags: ["Just major", "Veil", "Sustain"],
    settings: { loopMode: "continuous", veil: 0.28, veilHz: 0.4, shimmer: 0.36, wet: 0.15, hall: 0.36, width: 0.8 },
    bowls: [
      b(146.83, 0.84, "gold", 0.3, 0.55, 0.8, 0.22),
      b(183.54, 0.68, "emerald", 0.48, 0.34, 0.66, 0.28),
      b(220.25, 0.58, "gold", 0.64, 0.52, 0.58, 0.3),
      b(293.66, 0.48, "emerald", 0.36, 0.74, 0.5, 0.32),
      b(367.08, 0.4, "platinum", 0.58, 0.22, 0.42, 0.38),
      b(440.5, 0.36, "gold", 0.72, 0.36, 0.36, 0.42),
    ],
  },
  {
    id: "hemispheres",
    name: "Hemispheres",
    blurb: "Four quartz fifths plus a hard-panned pair one hertz apart. Slow on speakers, wider in headphones.",
    tags: ["Headphones", "1 Hz bed", "Quartz"],
    settings: {
      loopMode: "continuous",
      veil: 0,
      shimmer: 0.14,
      wet: 0.08,
      hall: 0.22,
      width: 0.96,
      binaural: true,
      binauralCarrier: 128,
      binauralBeat: 1,
      binauralLevel: 0.45,
      air: 0.04,
    },
    bowls: [
      b(96, 0.9, "quartz", 0.3, 0.58, 0.78, 0.14),
      b(144, 0.7, "quartz", 0.5, 0.38, 0.64, 0.2),
      b(192, 0.56, "quartz", 0.66, 0.6, 0.54, 0.24),
      b(288, 0.42, "selenite", 0.4, 0.22, 0.44, 0.3),
    ],
  },
  {
    id: "chakra-column",
    name: "Chakra Column",
    blurb: "Just diatonic from C3 = 128 Hz: 1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8. Seven glasses, one column.",
    tags: ["Just diatonic", "Seven glasses", "Sustain"],
    settings: { loopMode: "continuous", veil: 0, shimmer: 0.26, wet: 0.14, hall: 0.36, width: 0.5, depth: 0.55 },
    bowls: [
      b(128, 0.86, "obsidian", 0.48, 0.8, 0.78, 0.16),
      b(144, 0.74, "rose", 0.48, 0.68, 0.66, 0.2),
      b(160, 0.64, "gold", 0.48, 0.56, 0.6, 0.24),
      b(170.67, 0.56, "emerald", 0.48, 0.45, 0.54, 0.26),
      b(192, 0.5, "aqua", 0.48, 0.34, 0.5, 0.3),
      b(213.33, 0.44, "phantom", 0.48, 0.24, 0.44, 0.32),
      b(240, 0.38, "quartz", 0.48, 0.14, 0.4, 0.36),
    ],
  },
  {
    id: "canon-of-fifths",
    name: "Canon of Fifths",
    blurb: "Five gold fifths enter in a canon, hold, then release. The phrase loops; each bowl is offset.",
    tags: ["Gold", "Canon 36s", "Staggered"],
    settings: { loopMode: "canon", period: 36, veil: 0, shimmer: 0.3, wet: 0.2, hall: 0.5, width: 0.86 },
    bowls: [
      b(110, 0.92, "gold", 0.26, 0.58, 0.82, 0.16),
      b(165, 0.74, "gold", 0.4, 0.38, 0.7, 0.2),
      b(247.5, 0.6, "emerald", 0.56, 0.6, 0.58, 0.26),
      b(371.25, 0.46, "gold", 0.7, 0.4, 0.48, 0.32),
      b(556.88, 0.36, "platinum", 0.48, 0.22, 0.4, 0.4),
    ],
  },
];

export const DEFAULT_PRESET_ID = "heart-chamber";

const PRESET_MAP = new Map(PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(id: string | null): Preset | undefined {
  if (!id) return undefined;
  return PRESET_MAP.get(id);
}

export function instantiatePreset(id: string): { bowls: Bowl[]; settingsPatch: Partial<MusicalSettings>; preset: Preset } {
  const preset = PRESET_MAP.get(id) ?? PRESETS[0]!;
  return {
    preset,
    settingsPatch: preset.settings,
    bowls: preset.bowls.map((bowl, index) => ({
      ...bowl,
      id: `${preset.id}-${index}`,
      muted: false,
    })),
  };
}

for (const preset of PRESETS) {
  if (preset.bowls.length < MIN_BOWLS || preset.bowls.length > MAX_BOWLS) {
    throw new Error(`Preset ${preset.id} has ${preset.bowls.length} bowls`);
  }
}
