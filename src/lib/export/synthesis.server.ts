import { GLASS } from "../audio/glass.ts";
import type { Bowl, Dome, Ear, LoopMode, Settings, Soundscape } from "../audio/types.ts";
import { getRoom } from "../audio/rooms.ts";

export type RenderedAudio = {
  sampleRate: number;
  durationSeconds: number;
  masterLeft: Float32Array;
  masterRight: Float32Array;
  stems: {
    id: string;
    label: string;
    left: Float32Array;
    right: Float32Array;
  }[];
};

function loopEnvelope(mode: LoopMode, t: number, period: number): number {
  const norm = (t % period) / period;
  if (mode === "breath") {
    return 0.2 + 0.8 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * norm));
  }
  if (mode === "tide") {
    const lo = 0.16;
    if (norm < 0.72) {
      const u = norm / 0.72;
      return lo + (1 - lo) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    const u = (norm - 0.72) / 0.28;
    return lo + (1 - lo) * (0.5 + 0.5 * Math.cos(Math.PI * u));
  }
  if (mode === "mallet") {
    const phase = t % 4; // 4 second mallet strikes
    const attack = Math.min(1, phase / 0.015);
    return attack * Math.exp(-phase * 2.8);
  }
  if (mode === "canon") {
    return 0.5 + 0.5 * Math.sin((Math.PI * 2 * t) / period);
  }
  // Continuous
  return 1.0;
}

export function synthesizeScene(
  scene: Soundscape,
  durationSeconds: number,
  sampleRate = 48000,
  includeStems = false,
): RenderedAudio {
  const totalFrames = Math.floor(durationSeconds * sampleRate);
  const masterLeft = new Float32Array(totalFrames);
  const masterRight = new Float32Array(totalFrames);

  const ears: Ear[] = scene.ears?.length
    ? scene.ears
    : [
        {
          id: "ear-1",
          x: scene.receiver?.x ?? 0.5,
          y: scene.receiver?.y ?? 0.5,
          height: scene.receiver?.height ?? 0.85,
          yaw: scene.receiver?.yaw ?? 0,
          left: { x: -0.12, y: 0, z: 0.02, gain: 1, size: 0.72 },
          right: { x: 0.12, y: 0, z: 0.02, gain: 1, size: 0.72 },
        },
      ];

  const stemBuffers: {
    id: string;
    label: string;
    left: Float32Array;
    right: Float32Array;
  }[] = ears.map((ear, idx) => ({
    id: ear.id,
    label: idx === 0 ? "Main Ear Horns" : `Recording Stem ${idx}`,
    left: new Float32Array(totalFrames),
    right: new Float32Array(totalFrames),
  }));

  const bowls = scene.bowls || [];
  const settings = scene.settings;
  const loopMode = settings.loopMode || "breath";
  const period = Math.max(4, settings.period || 16);
  const domes = scene.domes || [];

  // Synthesize bowls into each ear
  for (let b = 0; b < bowls.length; b++) {
    const bowl = bowls[b]!;
    if (bowl.muted) continue;

    const baseFreq = bowl.frequency;
    const profile = GLASS[bowl.glass] || GLASS.quartz;
    const partials = profile.partials;
    const gain = bowl.gain * (bowl.sing || 0.8);

    // Compute acoustics for each ear
    for (let e = 0; e < ears.length; e++) {
      const ear = ears[e]!;
      const stem = stemBuffers[e]!;

      // Distance and angles
      const dx = bowl.x - ear.x;
      const dy = bowl.y - ear.y;
      const dist = Math.max(0.2, Math.hypot(dx, dy));
      const distAttenuation = 1 / (1 + dist * 1.4);

      // Stereo panning from angle to ear facing
      const angleToBowl = Math.atan2(dy, dx);
      const relativeAngle = angleToBowl - (ear.yaw || 0);
      const pan = Math.sin(relativeAngle); // -1 (left) to +1 (right)

      const leftPanGain = Math.cos(((pan + 1) * Math.PI) / 4);
      const rightPanGain = Math.sin(((pan + 1) * Math.PI) / 4);

      const ampL = gain * distAttenuation * leftPanGain * (ear.left.gain ?? 1);
      const ampR = gain * distAttenuation * rightPanGain * (ear.right.gain ?? 1);

      // Generate waveform in chunks to keep memory and CPU efficient
      const chunkSize = 16384;
      for (let offset = 0; offset < totalFrames; offset += chunkSize) {
        const count = Math.min(chunkSize, totalFrames - offset);
        for (let i = 0; i < count; i++) {
          const t = (offset + i) / sampleRate;
          const env = loopEnvelope(loopMode, t + b * (period / bowls.length), period);

          // Fundamental + LFO sing flutter
          const singLfo = 1 + 0.015 * Math.sin(2 * Math.PI * 5.2 * t);
          const f0 = baseFreq * singLfo;

          let s = Math.sin(2 * Math.PI * f0 * t);

          // Glass partials
          for (let p = 0; p < partials.length; p++) {
            const part = partials[p]!;
            s += Math.sin(2 * Math.PI * baseFreq * part.ratio * t) * part.gain;
          }

          const sample = s * env;
          stem.left[offset + i] += sample * ampL;
          stem.right[offset + i] += sample * ampR;
        }
      }
    }
  }

  // Synthesize Domes (face-down ceiling shells returning waves)
  if (domes.length > 0) {
    for (const dome of domes) {
      const delaySec = Math.max(0.02, (dome.height * 2) / 343); // Speed of sound ~343 m/s
      const delaySamples = Math.floor(delaySec * sampleRate);
      const reflect = (dome.reflect || 0.6) * 0.35;
      const domeFreq = dome.frequency || 432;

      for (let e = 0; e < ears.length; e++) {
        const stem = stemBuffers[e]!;
        for (let i = delaySamples; i < totalFrames; i++) {
          const t = i / sampleRate;
          const resonantMod = 1 + 0.1 * Math.sin(2 * Math.PI * domeFreq * t);
          stem.left[i] += stem.left[i - delaySamples]! * reflect * resonantMod * 0.5;
          stem.right[i] += stem.right[i - delaySamples]! * reflect * resonantMod * 0.5;
        }
      }
    }
  }

  // Binaural Beat Carrier & Tone (into master ear)
  if (settings.binaural) {
    const carrier = settings.binauralCarrier || 216;
    const beat = settings.binauralBeat || 4.5;
    const level = (settings.binauralLevel || 0.4) * 0.25;

    const fL = carrier;
    const fR = carrier + beat;

    const mainStem = stemBuffers[0]!;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / sampleRate;
      mainStem.left[i] += Math.sin(2 * Math.PI * fL * t) * level;
      mainStem.right[i] += Math.sin(2 * Math.PI * fR * t) * level;
    }
  }

  // Room Reverberation / Diffusion
  const room = getRoom(settings.roomShape);
  const decay = settings.decay ?? room.decay;
  const early = settings.early ?? room.early;
  const wet = (settings.wet ?? 0.4) * 0.5;

  for (const stem of stemBuffers) {
    // Early reflections
    const r1 = Math.floor(0.018 * sampleRate);
    const r2 = Math.floor(0.033 * sampleRate);
    const r3 = Math.floor(0.054 * sampleRate);

    for (let i = r3; i < totalFrames; i++) {
      const echoL =
        stem.left[i - r1]! * 0.45 * early -
        stem.right[i - r2]! * 0.32 * early +
        stem.left[i - r3]! * 0.22 * decay;

      const echoR =
        stem.right[i - r1]! * 0.45 * early +
        stem.left[i - r2]! * 0.32 * early +
        stem.right[i - r3]! * 0.22 * decay;

      stem.left[i] += echoL * wet;
      stem.right[i] += echoR * wet;
    }
  }

  // Master mix is ear-1
  const mainEar = stemBuffers[0]!;
  masterLeft.set(mainEar.left);
  masterRight.set(mainEar.right);

  // Normalize to -0.5 dB peak
  let maxPeak = 0.0001;
  for (let i = 0; i < totalFrames; i++) {
    const al = Math.abs(masterLeft[i]!);
    const ar = Math.abs(masterRight[i]!);
    if (al > maxPeak) maxPeak = al;
    if (ar > maxPeak) maxPeak = ar;
  }

  const targetPeak = 0.94; // ~ -0.54 dB
  const scale = targetPeak / maxPeak;

  for (let i = 0; i < totalFrames; i++) {
    masterLeft[i] *= scale;
    masterRight[i] *= scale;
  }

  // Normalize stems
  for (const stem of stemBuffers) {
    for (let i = 0; i < totalFrames; i++) {
      stem.left[i] *= scale;
      stem.right[i] *= scale;
    }
  }

  return {
    sampleRate,
    durationSeconds,
    masterLeft,
    masterRight,
    stems: includeStems ? stemBuffers : [],
  };
}
