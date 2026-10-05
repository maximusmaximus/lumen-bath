import type { MusicalSettings, RoomShapeId } from "@/lib/audio/types";

export type Reflection = { delay: number; gain: number; pan: number };

export type RoomProfile = {
  id: RoomShapeId;
  label: string;
  blurb: string;
  spanX: number;
  spanZ: number;
  wall: number;
  fog: number;
  width: number;
  depth: number;
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
  flutterSec: number;
  slapSec: number;
  modesHz: [number, number, number];
  reflections: Reflection[];
};

const tap = (delay: number, gain: number, pan: number): Reflection => ({ delay, gain, pan });

export const ROOMS: RoomProfile[] = [
  {
    id: "rotunda",
    label: "Rotunda",
    blurb: "Round walls. The bloom is even, and parallel-wall flutter never quite forms.",
    spanX: 7.2,
    spanZ: 7.2,
    wall: 1.7,
    fog: 0.045,
    width: 0.78,
    depth: 0.32,
    decay: 0.46,
    early: 0.4,
    diffusion: 0.66,
    absorption: 0.28,
    flutter: 0.05,
    modes: 0.12,
    airLoss: 0.24,
    slap: 0.08,
    bloom: 0.26,
    space: 0.58,
    flutterSec: 0.019,
    slapSec: 0.07,
    modesHz: [74, 118, 166],
    reflections: [tap(0.014, 0.7, -0.35), tap(0.019, 0.62, 0.4), tap(0.027, 0.5, -0.7), tap(0.033, 0.46, 0.65), tap(0.046, 0.32, -0.2), tap(0.058, 0.24, 0.25)],
  },
  {
    id: "cube",
    label: "Cube",
    blurb: "Equal walls. Standing waves stack, and the flutter between faces is obvious.",
    spanX: 6.4,
    spanZ: 6.4,
    wall: 1.85,
    fog: 0.04,
    width: 0.7,
    depth: 0.7,
    decay: 0.42,
    early: 0.55,
    diffusion: 0.22,
    absorption: 0.2,
    flutter: 0.78,
    modes: 0.84,
    airLoss: 0.18,
    slap: 0.22,
    bloom: 0.48,
    space: 0.3,
    flutterSec: 0.012,
    slapSec: 0.048,
    modesHz: [86, 128, 172],
    reflections: [tap(0.012, 0.85, -0.85), tap(0.012, 0.85, 0.85), tap(0.018, 0.7, 0), tap(0.024, 0.55, -0.4), tap(0.024, 0.55, 0.4), tap(0.036, 0.4, 0)],
  },
  {
    id: "shoebox",
    label: "Shoebox",
    blurb: "A classic hall. Side walls arrive first and wrap the tail around you.",
    spanX: 9.4,
    spanZ: 5.4,
    wall: 2.05,
    fog: 0.035,
    width: 0.86,
    depth: 0.5,
    decay: 0.62,
    early: 0.7,
    diffusion: 0.48,
    absorption: 0.32,
    flutter: 0.28,
    modes: 0.36,
    airLoss: 0.3,
    slap: 0.18,
    bloom: 0.34,
    space: 0.86,
    flutterSec: 0.021,
    slapSec: 0.09,
    modesHz: [58, 96, 142],
    reflections: [tap(0.011, 0.9, -0.92), tap(0.013, 0.86, 0.9), tap(0.028, 0.5, -0.15), tap(0.034, 0.46, 0.2), tap(0.052, 0.34, -0.55), tap(0.07, 0.28, 0.5)],
  },
  {
    id: "corridor",
    label: "Corridor",
    blurb: "Long and narrow. A hard flutter and a slap that keeps coming back.",
    spanX: 11.2,
    spanZ: 3.15,
    wall: 2.35,
    fog: 0.03,
    width: 0.94,
    depth: 0.2,
    decay: 0.5,
    early: 0.62,
    diffusion: 0.12,
    absorption: 0.16,
    flutter: 0.92,
    modes: 0.4,
    airLoss: 0.38,
    slap: 0.8,
    bloom: 0.22,
    space: 0.16,
    flutterSec: 0.009,
    slapSec: 0.13,
    modesHz: [48, 96, 144],
    reflections: [tap(0.008, 0.95, -0.95), tap(0.008, 0.95, 0.95), tap(0.04, 0.6, 0.1), tap(0.078, 0.5, -0.1), tap(0.12, 0.42, 0), tap(0.17, 0.3, 0)],
  },
  {
    id: "chapel",
    label: "Chapel",
    blurb: "Small and tall. The first bounce is close, the tail is short and warm.",
    spanX: 4.8,
    spanZ: 4.8,
    wall: 2.7,
    fog: 0.05,
    width: 0.48,
    depth: 0.48,
    decay: 0.28,
    early: 0.78,
    diffusion: 0.4,
    absorption: 0.36,
    flutter: 0.18,
    modes: 0.3,
    airLoss: 0.12,
    slap: 0.14,
    bloom: 0.62,
    space: 0.36,
    flutterSec: 0.011,
    slapSec: 0.042,
    modesHz: [98, 146, 196],
    reflections: [tap(0.007, 0.9, -0.5), tap(0.009, 0.82, 0.55), tap(0.014, 0.6, -0.2), tap(0.018, 0.5, 0.25), tap(0.026, 0.32, 0), tap(0.034, 0.22, 0.1)],
  },
  {
    id: "nave",
    label: "Nave",
    blurb: "A long stone room. Decay hangs on, and the far wall answers late.",
    spanX: 11.6,
    spanZ: 4.9,
    wall: 3.25,
    fog: 0.028,
    width: 0.9,
    depth: 0.4,
    decay: 0.9,
    early: 0.58,
    diffusion: 0.44,
    absorption: 0.22,
    flutter: 0.34,
    modes: 0.46,
    airLoss: 0.42,
    slap: 0.55,
    bloom: 0.4,
    space: 0.72,
    flutterSec: 0.026,
    slapSec: 0.16,
    modesHz: [46, 78, 124],
    reflections: [tap(0.016, 0.7, -0.8), tap(0.02, 0.64, 0.78), tap(0.048, 0.55, -0.2), tap(0.09, 0.48, 0.15), tap(0.14, 0.36, -0.35), tap(0.2, 0.28, 0.3)],
  },
  {
    id: "dome",
    label: "Dome",
    blurb: "A hemisphere. Late sound gathers overhead, smooth and a little focused.",
    spanX: 8.4,
    spanZ: 8.4,
    wall: 2.4,
    fog: 0.038,
    width: 0.8,
    depth: 0.8,
    decay: 0.74,
    early: 0.36,
    diffusion: 0.84,
    absorption: 0.26,
    flutter: 0.12,
    modes: 0.52,
    airLoss: 0.2,
    slap: 0.26,
    bloom: 0.58,
    space: 0.64,
    flutterSec: 0.016,
    slapSec: 0.062,
    modesHz: [64, 128, 192],
    reflections: [tap(0.018, 0.55, -0.3), tap(0.022, 0.5, 0.35), tap(0.03, 0.46, -0.6), tap(0.034, 0.44, 0.55), tap(0.055, 0.5, 0), tap(0.08, 0.34, 0.1)],
  },
  {
    id: "fan",
    label: "Fan hall",
    blurb: "Wide at the front, tight behind you. One side of the image opens up.",
    spanX: 9.8,
    spanZ: 6.6,
    wall: 1.95,
    fog: 0.034,
    width: 0.92,
    depth: 0.58,
    decay: 0.52,
    early: 0.6,
    diffusion: 0.38,
    absorption: 0.3,
    flutter: 0.16,
    modes: 0.22,
    airLoss: 0.28,
    slap: 0.2,
    bloom: 0.24,
    space: 0.78,
    flutterSec: 0.02,
    slapSec: 0.075,
    modesHz: [62, 104, 156],
    reflections: [tap(0.01, 0.88, -0.95), tap(0.016, 0.5, 0.35), tap(0.024, 0.7, -0.7), tap(0.04, 0.32, 0.6), tap(0.06, 0.28, -0.2), tap(0.09, 0.18, 0.15)],
  },
  {
    id: "cave",
    label: "Cave",
    blurb: "Uneven stone. A dark, long tail with lumpy bass and little clarity.",
    spanX: 7.6,
    spanZ: 6.8,
    wall: 2.5,
    fog: 0.085,
    width: 0.68,
    depth: 0.64,
    decay: 0.84,
    early: 0.48,
    diffusion: 0.9,
    absorption: 0.78,
    flutter: 0.36,
    modes: 0.7,
    airLoss: 0.55,
    slap: 0.32,
    bloom: 0.8,
    space: 0.5,
    flutterSec: 0.023,
    slapSec: 0.11,
    modesHz: [52, 88, 133],
    reflections: [tap(0.013, 0.6, -0.4), tap(0.021, 0.4, 0.7), tap(0.029, 0.55, -0.85), tap(0.047, 0.35, 0.15), tap(0.07, 0.4, -0.25), tap(0.1, 0.3, 0.45)],
  },
  {
    id: "court",
    label: "Courtyard",
    blurb: "Open air. Almost no tail — a short slap off one wall, then the highs fall away.",
    spanX: 9.2,
    spanZ: 9.2,
    wall: 0.42,
    fog: 0.018,
    width: 0.84,
    depth: 0.84,
    decay: 0.08,
    early: 0.22,
    diffusion: 0.14,
    absorption: 0.7,
    flutter: 0.04,
    modes: 0.06,
    airLoss: 0.88,
    slap: 0.46,
    bloom: 0.08,
    space: 0.22,
    flutterSec: 0.03,
    slapSec: 0.085,
    modesHz: [70, 110, 150],
    reflections: [tap(0.02, 0.35, -0.2), tap(0.045, 0.7, 0.55), tap(0.06, 0.2, -0.4), tap(0.08, 0.12, 0.1), tap(0.1, 0.08, 0), tap(0.12, 0.05, -0.1)],
  },
  {
    id: "golden",
    label: "Golden hall",
    blurb: "A golden rectangle, wide to deep. The sides arrive in a calm uneven pair, and the tail stays even.",
    spanX: 9.71,
    spanZ: 6,
    wall: 2.15,
    fog: 0.032,
    width: 0.84,
    depth: 0.52,
    decay: 0.58,
    early: 0.64,
    diffusion: 0.52,
    absorption: 0.3,
    flutter: 0.22,
    modes: 0.28,
    airLoss: 0.26,
    slap: 0.16,
    bloom: 0.3,
    space: 0.74,
    flutterSec: 0.02,
    slapSec: 0.08,
    modesHz: [56, 92, 148],
    reflections: [tap(0.012, 0.84, -0.88), tap(0.016, 0.72, 0.7), tap(0.03, 0.48, -0.2), tap(0.042, 0.4, 0.24), tap(0.064, 0.3, -0.4), tap(0.09, 0.22, 0.3)],
  },
  {
    id: "gilded",
    label: "Golden chapel",
    blurb: "The same proportion, stood on its end. Tall, narrow, and warm, with the first bounce close overhead.",
    spanX: 5.6,
    spanZ: 9.06,
    wall: 3.15,
    fog: 0.042,
    width: 0.46,
    depth: 0.74,
    decay: 0.4,
    early: 0.8,
    diffusion: 0.46,
    absorption: 0.34,
    flutter: 0.2,
    modes: 0.38,
    airLoss: 0.16,
    slap: 0.18,
    bloom: 0.7,
    space: 0.42,
    flutterSec: 0.012,
    slapSec: 0.05,
    modesHz: [88, 140, 188],
    reflections: [tap(0.008, 0.88, -0.55), tap(0.01, 0.8, 0.5), tap(0.016, 0.58, -0.15), tap(0.022, 0.46, 0.2), tap(0.034, 0.3, 0), tap(0.048, 0.2, 0.1)],
  },
  {
    id: "octagon",
    label: "Octagon",
    blurb: "Eight walls. Parallel flutter almost disappears, and the sound turns in a slow circle.",
    spanX: 7.8,
    spanZ: 7.8,
    wall: 2.2,
    fog: 0.036,
    width: 0.74,
    depth: 0.74,
    decay: 0.66,
    early: 0.5,
    diffusion: 0.86,
    absorption: 0.24,
    flutter: 0.08,
    modes: 0.34,
    airLoss: 0.22,
    slap: 0.1,
    bloom: 0.36,
    space: 0.7,
    flutterSec: 0.018,
    slapSec: 0.06,
    modesHz: [68, 112, 160],
    reflections: [tap(0.014, 0.6, -0.7), tap(0.016, 0.58, 0.65), tap(0.022, 0.5, -0.25), tap(0.026, 0.48, 0.3), tap(0.04, 0.36, 0), tap(0.055, 0.28, -0.1)],
  },
  {
    id: "apse",
    label: "Apse",
    blurb: "A flat wall behind you and a curved end ahead. Sound gathers in the curve, then answers once.",
    spanX: 6.4,
    spanZ: 9.4,
    wall: 2.6,
    fog: 0.04,
    width: 0.58,
    depth: 0.72,
    decay: 0.54,
    early: 0.72,
    diffusion: 0.58,
    absorption: 0.28,
    flutter: 0.14,
    modes: 0.42,
    airLoss: 0.2,
    slap: 0.48,
    bloom: 0.5,
    space: 0.56,
    flutterSec: 0.015,
    slapSec: 0.1,
    modesHz: [62, 108, 154],
    reflections: [tap(0.01, 0.86, 0), tap(0.014, 0.6, -0.6), tap(0.018, 0.55, 0.55), tap(0.032, 0.42, -0.2), tap(0.05, 0.36, 0.15), tap(0.08, 0.24, 0)],
  },
  {
    id: "ellipse",
    label: "Ellipse",
    blurb: "A whispering gallery in the golden proportion. Two foci trade the sound, and the wall carries it.",
    spanX: 10.2,
    spanZ: 6.3,
    wall: 1.85,
    fog: 0.03,
    width: 0.9,
    depth: 0.56,
    decay: 0.7,
    early: 0.44,
    diffusion: 0.34,
    absorption: 0.2,
    flutter: 0.18,
    modes: 0.76,
    airLoss: 0.24,
    slap: 0.36,
    bloom: 0.28,
    space: 0.66,
    flutterSec: 0.017,
    slapSec: 0.072,
    modesHz: [54, 108, 162],
    reflections: [tap(0.015, 0.66, -0.4), tap(0.02, 0.62, 0.45), tap(0.028, 0.5, -0.85), tap(0.034, 0.48, 0.8), tap(0.06, 0.34, 0), tap(0.09, 0.26, 0.1)],
  },
];

const ROOM_MAP = new Map(ROOMS.map((room) => [room.id, room]));

export const FRESH_SHAPES = new Set<RoomShapeId>(["golden", "gilded", "octagon", "apse", "ellipse"]);

export function isRoomShape(value: unknown): value is RoomShapeId {
  return typeof value === "string" && ROOM_MAP.has(value as RoomShapeId);
}

export function getRoom(id: string | undefined | null): RoomProfile {
  if (id && ROOM_MAP.has(id as RoomShapeId)) return ROOM_MAP.get(id as RoomShapeId)!;
  return ROOMS[0]!;
}

export type RoomPatch = Pick<
  MusicalSettings,
  | "roomShape"
  | "width"
  | "depth"
  | "decay"
  | "early"
  | "diffusion"
  | "absorption"
  | "flutter"
  | "modes"
  | "airLoss"
  | "slap"
  | "bloom"
  | "space"
>;

export function roomPatch(id: string | undefined | null): RoomPatch {
  const room = getRoom(id);
  return {
    roomShape: room.id,
    width: room.width,
    depth: room.depth,
    decay: room.decay,
    early: room.early,
    diffusion: room.diffusion,
    absorption: room.absorption,
    flutter: room.flutter,
    modes: room.modes,
    airLoss: room.airLoss,
    slap: room.slap,
    bloom: room.bloom,
    space: room.space,
  };
}

export type RoomEffectKey =
  | "decay"
  | "early"
  | "diffusion"
  | "absorption"
  | "flutter"
  | "modes"
  | "airLoss"
  | "slap"
  | "bloom"
  | "space";

export const ROOM_EFFECTS: { key: RoomEffectKey; label: string; hint: string }[] = [
  { key: "decay", label: "Decay", hint: "How long the room keeps ringing after the glass." },
  { key: "early", label: "Early reflections", hint: "The first bounce off the nearest walls." },
  { key: "diffusion", label: "Diffusion", hint: "Breaks the tail up so it turns into a smooth wash." },
  { key: "absorption", label: "Absorption", hint: "Soft walls swallow the highs in the tail." },
  { key: "flutter", label: "Flutter", hint: "A rapid echo bouncing between parallel walls." },
  { key: "modes", label: "Standing waves", hint: "Bass notes the room itself reinforces." },
  { key: "airLoss", label: "Air loss", hint: "Far bowls lose their edge as the air eats the top." },
  { key: "slap", label: "Slapback", hint: "One distinct echo, then quiet." },
  { key: "bloom", label: "Bass bloom", hint: "Low end gathers in the corners." },
  { key: "space", label: "Envelopment", hint: "How far the tail wraps around your ears." },
];
