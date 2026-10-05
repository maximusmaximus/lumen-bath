import type { Bowl, Dome, Ear, GlassId, LoopMode, Receiver, RoomShapeId, Settings, Soundscape } from "../audio/types.ts";
const DEFAULT_LEFT = { x: -0.12, y: 0, z: 0.02, gain: 1, size: 0.72 };
const DEFAULT_RIGHT = { x: 0.12, y: 0, z: 0.02, gain: 1, size: 0.72 };

function makeEar(receiver: Receiver, id: string): Ear {
  return {
    ...receiver,
    id,
    left: { ...DEFAULT_LEFT },
    right: { ...DEFAULT_RIGHT },
  };
}
import { ROOMS, getRoom } from "../audio/rooms.ts";
import { GLASS_IDS } from "../audio/glass.ts";
import type { GongId } from "../audio/gong.ts";

export type SceneIntent = {
  prompt?: string;
  roomShape?: RoomShapeId;
  tuning?: "chakra" | "solfeggio" | "planetary" | "fifths" | "deep_drone" | "angelic" | "pentatonic";
  bowlCount?: number;
  layout?: "circle" | "spiral" | "front_arc" | "stereo_antiphonal" | "sanctuary";
  loopMode?: LoopMode;
  binauralBeatHz?: number;
  binauralCarrierHz?: number;
  stemCount?: number;
  domeCount?: number;
  title?: string;
  description?: string;
};

// Standard Harmonic Sets
const CHAKRA_FREQUENCIES: { note: string; hz: number; glass: GlassId; gong: GongId }[] = [
  { note: "Root (C)", hz: 194.18, glass: "obsidian", gong: "felt" },
  { note: "Sacral (D)", hz: 216.0, glass: "gold", gong: "wood" },
  { note: "Solar Plexus (E)", hz: 243.0, glass: "frosted", gong: "suede" },
  { note: "Heart (F)", hz: 256.0, glass: "rose", gong: "rubber" },
  { note: "Throat (G)", hz: 288.0, glass: "aqua", gong: "felt" },
  { note: "Third Eye (A)", hz: 432.0, glass: "phantom", gong: "brass" },
  { note: "Crown (B)", hz: 486.0, glass: "selenite", gong: "brass" },
];

const SOLFEGGIO_FREQUENCIES: { hz: number; glass: GlassId; gong: GongId }[] = [
  { hz: 174, glass: "obsidian", gong: "felt" },
  { hz: 285, glass: "frosted", gong: "suede" },
  { hz: 396, glass: "gold", gong: "wood" },
  { hz: 417, glass: "rose", gong: "felt" },
  { hz: 528, glass: "quartz", gong: "brass" }, // Miracle / DNA repair
  { hz: 639, glass: "aqua", gong: "rubber" },
  { hz: 741, glass: "emerald", gong: "suede" },
  { hz: 852, glass: "platinum", gong: "brass" },
  { hz: 963, glass: "selenite", gong: "brass" },
];

const PLANETARY_FREQUENCIES: { name: string; hz: number; glass: GlassId }[] = [
  { name: "Sun", hz: 126.22, glass: "gold" },
  { name: "Earth Om", hz: 136.1, glass: "rose" },
  { name: "Earth Day", hz: 194.18, glass: "obsidian" },
  { name: "Moon", hz: 210.42, glass: "selenite" },
  { name: "Jupiter", hz: 183.58, glass: "emerald" },
  { name: "Venus", hz: 221.23, glass: "quartz" },
];

export function parsePromptIntent(prompt: string): Partial<SceneIntent> {
  const p = prompt.toLowerCase();
  const intent: Partial<SceneIntent> = { prompt };

  // Room inference
  if (p.includes("rotunda") || p.includes("round") || p.includes("circular")) intent.roomShape = "rotunda";
  else if (p.includes("golden") || p.includes("hall") || p.includes("concert")) intent.roomShape = "golden";
  else if (p.includes("chapel") || p.includes("church")) intent.roomShape = "chapel";
  else if (p.includes("nave") || p.includes("cathedral")) intent.roomShape = "nave";
  else if (p.includes("cave") || p.includes("cavern") || p.includes("grotto")) intent.roomShape = "cave";
  else if (p.includes("shoebox") || p.includes("acoustic hall")) intent.roomShape = "shoebox";
  else if (p.includes("ellipse") || p.includes("whisper")) intent.roomShape = "ellipse";
  else if (p.includes("apse")) intent.roomShape = "apse";
  else if (p.includes("octagon")) intent.roomShape = "octagon";
  else if (p.includes("dome")) intent.roomShape = "dome";

  // Tuning inference
  if (p.includes("chakra")) intent.tuning = "chakra";
  else if (p.includes("solfeggio") || p.includes("528")) intent.tuning = "solfeggio";
  else if (p.includes("planetary") || p.includes("om") || p.includes("earth")) intent.tuning = "planetary";
  else if (p.includes("deep") || p.includes("bass") || p.includes("drone") || p.includes("grounding")) intent.tuning = "deep_drone";
  else if (p.includes("angel") || p.includes("high") || p.includes("shimmer") || p.includes("crystal")) intent.tuning = "angelic";
  else if (p.includes("fifths") || p.includes("pythagorean")) intent.tuning = "fifths";

  // Binaural inference
  if (p.includes("theta") || p.includes("deep sleep") || p.includes("meditation")) {
    intent.binauralBeatHz = 4.5;
  } else if (p.includes("delta") || p.includes("sleep")) {
    intent.binauralBeatHz = 2.5;
  } else if (p.includes("alpha") || p.includes("focus") || p.includes("calm")) {
    intent.binauralBeatHz = 10.0;
  } else if (p.includes("schumann") || p.includes("resonance")) {
    intent.binauralBeatHz = 7.83;
  }

  // Loop mode inference
  if (p.includes("breath") || p.includes("breathe")) intent.loopMode = "breath";
  else if (p.includes("tide") || p.includes("ocean") || p.includes("wave")) intent.loopMode = "tide";
  else if (p.includes("mallet") || p.includes("strike") || p.includes("gong")) intent.loopMode = "mallet";
  else if (p.includes("canon")) intent.loopMode = "canon";

  // Stem count
  if (p.includes("quad") || p.includes("4 stems") || p.includes("4 ears")) intent.stemCount = 4;
  else if (p.includes("stems") || p.includes("spatial")) intent.stemCount = 3;

  // Domes
  if (p.includes("dome") || p.includes("canopy") || p.includes("overhead")) {
    intent.domeCount = p.includes("4 domes") ? 4 : p.includes("2 domes") ? 2 : 1;
  }

  return intent;
}

export function generateSceneFromIntent(userIntent: SceneIntent): Soundscape {
  const mergedIntent = userIntent.prompt ? { ...parsePromptIntent(userIntent.prompt), ...userIntent } : userIntent;

  const roomShape: RoomShapeId = mergedIntent.roomShape || "golden";
  const room = getRoom(roomShape);

  const loopMode: LoopMode = mergedIntent.loopMode || "breath";
  const tuning = mergedIntent.tuning || "chakra";
  const layout = mergedIntent.layout || "circle";

  const count = Math.max(3, Math.min(20, mergedIntent.bowlCount || (tuning === "chakra" ? 7 : tuning === "solfeggio" ? 9 : 8)));

  // Center receiver (listener ear)
  const receiver: Receiver = {
    x: 0.5,
    y: 0.52,
    height: 0.85,
    yaw: 0,
    pitch: 0.05,
  };

  // Generate bowls
  const bowls: Bowl[] = [];
  const radius = 0.32; // Normalised room radius
  const cx = 0.5;
  const cy = 0.5;

  for (let i = 0; i < count; i++) {
    let freq = 216;
    let glass: GlassId = "quartz";
    let gong: GongId = "felt";

    if (tuning === "chakra") {
      const item = CHAKRA_FREQUENCIES[i % CHAKRA_FREQUENCIES.length]!;
      freq = item.hz;
      glass = item.glass;
      gong = item.gong;
    } else if (tuning === "solfeggio") {
      const item = SOLFEGGIO_FREQUENCIES[i % SOLFEGGIO_FREQUENCIES.length]!;
      freq = item.hz;
      glass = item.glass;
      gong = item.gong;
    } else if (tuning === "planetary") {
      const item = PLANETARY_FREQUENCIES[i % PLANETARY_FREQUENCIES.length]!;
      freq = item.hz;
      glass = item.glass;
      gong = "felt";
    } else if (tuning === "deep_drone") {
      freq = 64 + i * 24;
      glass = i % 2 === 0 ? "obsidian" : "gold";
      gong = "suede";
    } else if (tuning === "angelic") {
      freq = 432 + i * 54;
      glass = i % 2 === 0 ? "platinum" : "selenite";
      gong = "brass";
    } else {
      freq = 144 * Math.pow(1.5, i % 6);
      glass = GLASS_IDS[i % GLASS_IDS.length]!;
      gong = "felt";
    }

    // Coordinates according to layout
    let x = cx;
    let y = cy;

    if (layout === "circle") {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      x = cx + Math.cos(angle) * radius;
      y = cy + Math.sin(angle) * radius;
    } else if (layout === "front_arc") {
      const angle = -Math.PI * 0.75 + (i / (count - 1)) * Math.PI * 0.5;
      x = cx + Math.sin(angle) * radius * 1.2;
      y = cy - Math.cos(angle) * radius * 0.9;
    } else if (layout === "spiral") {
      const angle = i * 0.78;
      const r = 0.12 + (i / count) * (radius * 1.2);
      x = cx + Math.cos(angle) * r;
      y = cy + Math.sin(angle) * r;
    } else if (layout === "stereo_antiphonal") {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2) / Math.ceil(count / 2);
      x = cx + side * (0.22 + row * 0.14);
      y = cy + (row - 0.5) * 0.45;
    } else {
      // Sanctuary
      const angle = (i / count) * Math.PI * 2;
      x = cx + Math.cos(angle) * (radius * (0.7 + (i % 2) * 0.4));
      y = cy + Math.sin(angle) * (radius * (0.7 + (i % 2) * 0.4));
    }

    bowls.push({
      id: `bowl-${i + 1}`,
      frequency: Math.round(freq * 10) / 10,
      size: 0.45 + (1 - i / count) * 0.4,
      height: 0.25 + (i % 3) * 0.2,
      glass,
      gain: 0.7 + (i % 4) * 0.08,
      x: Math.max(0.12, Math.min(0.88, x)),
      y: Math.max(0.12, Math.min(0.88, y)),
      sing: 0.65 + (i % 3) * 0.12,
      muted: false,
      gong,
    });
  }

  // Primary Ear
  const mainEar = makeEar(receiver, "ear-1");
  const ears: Ear[] = [mainEar];

  // Stems
  const stemCount = Math.max(0, Math.min(7, (mergedIntent.stemCount ?? 2) - 1));
  for (let s = 0; s < stemCount; s++) {
    const angle = ((s + 1) / (stemCount + 1)) * Math.PI * 2;
    const stemRec: Receiver = {
      x: cx + Math.cos(angle) * 0.38,
      y: cy + Math.sin(angle) * 0.38,
      height: 1.1 + s * 0.25,
      yaw: angle + Math.PI,
      pitch: 0.1,
    };
    ears.push({
      id: `stem-${s + 1}`,
      ...stemRec,
      left: { ...DEFAULT_LEFT, size: 0.8 },
      right: { ...DEFAULT_RIGHT, size: 0.8 },
    });
  }

  // Domes
  const domes: Dome[] = [];
  const domeCount = Math.max(0, Math.min(4, mergedIntent.domeCount ?? 2));
  for (let d = 0; d < domeCount; d++) {
    const angle = (d / Math.max(1, domeCount)) * Math.PI * 2 + Math.PI / 4;
    domes.push({
      id: `dome-${d + 1}`,
      x: cx + (domeCount > 1 ? Math.cos(angle) * 0.22 : 0),
      y: cy + (domeCount > 1 ? Math.sin(angle) * 0.22 : 0),
      size: 0.65,
      height: 1.45 + d * 0.2,
      glass: (d % 2 === 0 ? "platinum" : "gold") as GlassId,
      frequency: 216 * (d + 1),
      reflect: 0.72,
      diffuse: 0.55,
      brightness: 0.68,
    });
  }

  const settings: Settings = {
    loopMode,
    period: 16,
    veil: 0.38,
    veilHz: 1200,
    shimmer: 0.42,
    width: 0.76,
    depth: 0.68,
    binaural: true,
    binauralCarrier: mergedIntent.binauralCarrierHz || 216,
    binauralBeat: mergedIntent.binauralBeatHz || 4.5,
    binauralLevel: 0.45,
    wet: 0.42,
    hall: room.bloom ?? 0.5,
    air: 0.65,
    transpose: 0,
    roomShape,
    size: 4.5,
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
    volume: 0.85,
    awake: true,
    output: "session",
    domes,
    use: {
      playing: true,
      waves: true,
      cycle: ears.length > 1,
      cycleSeconds: 8,
    },
  };

  const title = mergedIntent.title || `${room.label} ${tuning.charAt(0).toUpperCase() + tuning.slice(1)} Bath`;
  const description =
    mergedIntent.description ||
    `Generative sound bath in ${room.label} featuring ${bowls.length} bowls (${tuning} tuning) with ${ears.length} listening horns and ${domes.length} acoustic domes.`;

  return {
    id: crypto.randomUUID(),
    name: title,
    updatedAt: Date.now(),
    bowls,
    settings,
    receiver,
    ears,
    domes,
  };
}
