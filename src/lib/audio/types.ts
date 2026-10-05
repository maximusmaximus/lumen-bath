import type { GongId } from "@/lib/audio/gong";

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

export type RoomShapeId =
  | "rotunda"
  | "cube"
  | "shoebox"
  | "corridor"
  | "chapel"
  | "nave"
  | "dome"
  | "fan"
  | "cave"
  | "court"
  | "golden"
  | "gilded"
  | "octagon"
  | "apse"
  | "ellipse";

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
  /** Mallet kept for this bowl. Saved with the template. */
  gong?: GongId;
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
  roomShape: RoomShapeId;
  size: number;
  decay: number;
  early: number;
  diffusion: number;
  absorption: number;
  flutter: number;
  modes: number;
  airLoss: number;
  slap: number;
  bloom: number;
  space: number;
};

export type Settings = MusicalSettings & {
  volume: number;
  awake: boolean;
  output: OutputMode;
  /** Span the bowls were arranged in. Shape changes keep this so the glass does not move. */
  layoutSpanX?: number;
  layoutSpanZ?: number;
  /** Mallet for each bowl, in bowl order. Kept when a template is saved. */
  gongs?: (GongId | null)[];
  /** Camera the author was looking through. A shared link opens here. */
  view?: SceneView;
  /** Playback, waves, and cycle as they were when the link was made. */
  use?: SceneUse;
  /** Overhead shells, kept with the template so a link rebuilds them. */
  domes?: Dome[];
  /** JPEG of the viewport, used as the link card. Stripped after a link opens. */
  poster?: string;
};

export type SceneView = {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
};

export type SceneUse = {
  playing: boolean;
  waves: boolean;
  cycle: boolean;
  cycleSeconds: number;
};

export type PresetBowl = Omit<Bowl, "id" | "muted">;

export type Receiver = {
  x: number;
  y: number;
  height: number;
  /** Added to facing the middle of the room, in radians. */
  yaw: number;
  /** Radians looking down from level. 0 looks straight ahead. */
  pitch?: number;
};

/** A capsule on an ear, in meters around the head. +x is to the ear's right, +y is up, +z is forward. */
export type EarSide = {
  x: number;
  y: number;
  z: number;
  gain: number;
  /** Cone length and spread. Bigger cones reach more of the glass. */
  size: number;
  /** Extra aim added to the ear tilt. Positive looks down, negative looks up. */
  pitch?: number;
  /** Extra turn for this horn only, added to the ear's facing. */
  yaw?: number;
};

export type PresetEar = Receiver & {
  left?: Partial<EarSide>;
  right?: Partial<EarSide>;
};

export type Preset = {
  id: string;
  name: string;
  blurb: string;
  tags: string[];
  bowls: PresetBowl[];
  settings: Partial<MusicalSettings>;
  receiver?: Receiver;
  /** First ear is what you hear. Further ears are recording stems. */
  ears?: PresetEar[];
  /** Every stem is used. Better downloaded than heard as one stereo mix. */
  download?: boolean;
  /** House presets ship with the app. AI presets are the weekly set. */
  source?: "house" | "ai";
  /** Walk the ear through the stems when the preset opens. */
  cycle?: { on: boolean; seconds: number };
  /** Face-down shells. Empty presets hang none. */
  domes?: PresetDome[];
};

export type PresetDome = Omit<Dome, "id">;

export type Ear = Receiver & {
  id: string;
  left: EarSide;
  right: EarSide;
};

export const MAX_EARS = 8;
export const MAX_DOMES = 4;

/** A shell hung face-down. Upward waves that meet it come back into the room. */
export type Dome = {
  id: string;
  x: number;
  y: number;
  /** How wide the opening is, from a tight cup to a broad ceiling. */
  size: number;
  /** How high the rim sits. Higher sends the bounce back later. */
  height: number;
  glass: GlassId;
  /** The note the shell likes to return. */
  frequency: number;
  /** How much of a rising wave is sent back down. */
  reflect: number;
  /** How much that bounce spreads instead of focusing. */
  diffuse: number;
  /** How much of the high end the shell keeps. */
  brightness: number;
};

export type Soundscape = {
  id: string;
  name: string;
  updatedAt: number;
  bowls: Bowl[];
  settings: Settings;
  receiver?: Receiver;
  ears?: Ear[];
  /** Overhead shells. Older saves omit this. */
  domes?: Dome[];
  /** Public link minted from this save. The first part is the author’s name. */
  share?: {
    userSlug: string;
    slug: string;
    templateId: string;
  };
};
