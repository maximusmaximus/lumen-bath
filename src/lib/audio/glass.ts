import type { GlassId } from "@/lib/audio/types";

export type PartialSpec = { ratio: number; gain: number };

export type GlassProfile = {
  id: GlassId;
  label: string;
  description: string;
  partials: PartialSpec[];
};

export const GLASS: Record<GlassId, GlassProfile> = {
  quartz: {
    id: "quartz",
    label: "Clear quartz",
    description: "Almost a pure sine. The clearest bowl in the room.",
    partials: [
      { ratio: 2, gain: 0.028 },
      { ratio: 3, gain: 0.01 },
    ],
  },
  frosted: {
    id: "frosted",
    label: "Frosted crystal",
    description: "Soft even partials. A little body, still transparent.",
    partials: [
      { ratio: 2, gain: 0.07 },
      { ratio: 3, gain: 0.04 },
      { ratio: 4, gain: 0.016 },
    ],
  },
  gold: {
    id: "gold",
    label: "Gold alchemy",
    description: "Warm octave, like metal dust in the quartz.",
    partials: [
      { ratio: 2, gain: 0.15 },
      { ratio: 3, gain: 0.035 },
      { ratio: 4, gain: 0.022 },
    ],
  },
  platinum: {
    id: "platinum",
    label: "Platinum",
    description: "Bright odd partials. Cuts without harshness.",
    partials: [
      { ratio: 2, gain: 0.04 },
      { ratio: 3, gain: 0.075 },
      { ratio: 4.01, gain: 0.026 },
      { ratio: 5, gain: 0.012 },
    ],
  },
  rose: {
    id: "rose",
    label: "Rose quartz",
    description: "Rounded second harmonic. Intimate and steady.",
    partials: [
      { ratio: 2, gain: 0.11 },
      { ratio: 3, gain: 0.045 },
      { ratio: 4, gain: 0.014 },
    ],
  },
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    description: "Dark glass. Strong octave, quiet above it.",
    partials: [
      { ratio: 2, gain: 0.19 },
      { ratio: 3, gain: 0.03 },
      { ratio: 4, gain: 0.016 },
    ],
  },
  aqua: {
    id: "aqua",
    label: "Aqua aura",
    description: "Airy upper partials. A halo more than a tone.",
    partials: [
      { ratio: 2, gain: 0.03 },
      { ratio: 3, gain: 0.022 },
      { ratio: 4, gain: 0.038 },
      { ratio: 5.01, gain: 0.016 },
    ],
  },
  emerald: {
    id: "emerald",
    label: "Emerald",
    description: "Even and odd together. Leafy, not muddy.",
    partials: [
      { ratio: 2, gain: 0.09 },
      { ratio: 3, gain: 0.06 },
      { ratio: 5, gain: 0.016 },
    ],
  },
  phantom: {
    id: "phantom",
    label: "Phantom quartz",
    description: "Inclusions. Slightly inharmonic, still glassy.",
    partials: [
      { ratio: 2.012, gain: 0.05 },
      { ratio: 2.76, gain: 0.042 },
      { ratio: 4.07, gain: 0.016 },
      { ratio: 5.85, gain: 0.008 },
    ],
  },
  selenite: {
    id: "selenite",
    label: "Selenite",
    description: "Pale and pure, with a whisper of octave.",
    partials: [
      { ratio: 2, gain: 0.045 },
      { ratio: 3, gain: 0.012 },
    ],
  },
};

export const GLASS_IDS = Object.keys(GLASS) as GlassId[];
