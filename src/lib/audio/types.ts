export const MIN_BOWLS = 3;
export const MAX_BOWLS = 20;
export const MIN_HZ = 48;
export const MAX_HZ = 960;

export type GlassId =
  | "quartz"
  | "frosted"
  | "gold"
  | "platinum"
  | "rose"
  | "obsidian"
  | "aqua"
  | "emerald"
  | "phantom"
  | "selenite";

export type LoopMode = "continuous" | "breath" | "tide" | "mallet" | "canon";

export type OutputMode = "session" | "direct";

export type Bowl = {
  id: string;
  frequency: number;
  size: number;
  height: number;
  glass: GlassId;
  gain: number;
  x: number;
  y: number;
  sing: number;
  muted: boolean;
};

export type MusicalSettings = {
  loopMode: LoopMode;
  period: number;
  veil: number;
  veilHz: number;
  shimmer: number;
  width: number;
  depth: number;
  binaural: boolean;
  binauralCarrier: number;
  binauralBeat: number;
  binauralLevel: number;
  wet: number;
  hall: number;
  air: number;
  transpose: number;
};

export type Settings = MusicalSettings & {
  volume: number;
  awake: boolean;
  output: OutputMode;
};

export type PresetBowl = Omit<Bowl, "id" | "muted">;

export type Preset = {
  id: string;
  name: string;
  blurb: string;
  tags: string[];
  bowls: PresetBowl[];
  settings: Partial<MusicalSettings>;
  receiver?: Receiver;
};

export type Receiver = {
  x: number;
  y: number;
  height: number;
};

export type Soundscape = {
  id: string;
  name: string;
  updatedAt: number;
  bowls: Bowl[];
  settings: Settings;
  receiver?: Receiver;
};
