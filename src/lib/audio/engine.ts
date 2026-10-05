import { cycleFadeSeconds } from "@/lib/audio/ear-order";
import { gongSpec, isGong, type GongId } from "@/lib/audio/gong";
import { GLASS } from "@/lib/audio/glass";
import { getRoom } from "@/lib/audio/rooms";
import { DEFAULT_SETTINGS } from "@/lib/audio/presets";
import { domeCeilings } from "@/lib/audio/dome";
import { bowlPoint, coneGain, DEFAULT_RECEIVER, earPitch, facingYaw, gatherCone, hearRelative, hornMouth, hornPitch, hornYaw, listenForward, listenPitch, listenPoint, listenUp, makeEar, receiverPoint } from "@/lib/audio/space";
import type { Bowl, Dome, Ear, LoopMode, OutputMode, Receiver, Settings } from "@/lib/audio/types";
import { concatFloats, encodeWavChannels } from "@/lib/audio/wav";

const MAX_PARTIALS = 4;

type Voice = {
  id: string;
  mix: GainNode;
  level: GainNode;
  singGain: GainNode;
  phraseGain: GainNode;
  air: BiquadFilterNode;
  panner: PannerNode;
  panGain: GainNode;
  arrive: GainNode;
  collect: GainNode;
  delayL: DelayNode;
  delayR: DelayNode;
  lowL: BiquadFilterNode;
  lowR: BiquadFilterNode;
  mouthL: GainNode;
  mouthR: GainNode;
  altGain: GainNode | null;
  altPanner: PannerNode | null;
  fund: OscillatorNode;
  fundGain: GainNode;
  partials: OscillatorNode[];
  partialGains: GainNode[];
  shadow: OscillatorNode;
  shadowGain: GainNode;
  shimmer: OscillatorNode[];
  shimmerGains: GainNode[];
  singLfo: OscillatorNode;
  modDepth: GainNode;
  driftLfo: OscillatorNode;
  driftDepth: GainNode;
  env: AudioBufferSourceNode | null;
  envAttached: boolean;
  beatMul: number;
  touchGain: GainNode;
  touchFilter: BiquadFilterNode;
  rimGain: GainNode;
  rimFilter: BiquadFilterNode;
  rimArmed: boolean;
  lastGong: number;
  taps?: {
    earId: string;
    delayL: DelayNode;
    delayR: DelayNode;
    lowL: BiquadFilterNode;
    lowR: BiquadFilterNode;
    gainL: GainNode;
    gainR: GainNode;
  }[];
};

function makeIr(ctx: AudioContext, settings: Settings): AudioBuffer {
  const decay = Math.min(1, Math.max(0, settings.decay));
  const hall = Math.min(1, Math.max(0, settings.hall));
  const diffusion = Math.min(1, Math.max(0, settings.diffusion));
  const absorption = Math.min(1, Math.max(0, settings.absorption));
  const seconds = 0.32 + decay * 2.7 + hall * 1.35;
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, len, rate);
  const damp = 7.4 - decay * 4.6 - hall * 1.1 + absorption * 3.6;
  const pole = 0.035 + (1 - absorption) * 0.16 + hall * 0.04;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t * Math.max(0.35, damp)) * Math.min(1, t / 0.01);
      const white = Math.random() * 2 - 1;
      low += (white - low) * pole;
      data[i] = (low * (1 - diffusion * 0.45) + white * diffusion * 0.55) * env * (channel === 0 ? 1 : 0.92);
    }
    const count = 3 + Math.round(diffusion * 12);
    for (let k = 0; k < count; k++) {
      const tap = 0.028 + ((k * 0.037 + channel * 0.017) % 0.2) * (0.55 + hall);
      const i = Math.floor(tap * rate);
      if (i > 0 && i < len) data[i] += (0.06 + diffusion * 0.1) * (k % 2 === 0 ? 1 : -0.75);
    }
  }
  let peak = 0.0001;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = 0.28 / peak;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) data[i] *= scale;
  }
  return buffer;
}

function envelopeShape(kind: LoopMode, t: number): number {
  if (kind === "breath") {
    return 0.2 + 0.8 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
  }
  if (kind === "tide") {
    const lo = 0.16;
    if (t < 0.72) {
      const u = t / 0.72;
      return lo + (1 - lo) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    const u = (t - 0.72) / 0.28;
    return lo + (1 - lo) * (0.5 + 0.5 * Math.cos(Math.PI * u));
  }
  if (kind === "mallet") {
    const attack = Math.min(1, t / 0.012);
    return attack * Math.exp(-t * 5.4);
  }
  if (t < 0.16) return 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.16);
  if (t < 0.62) return 1;
  const u = (t - 0.62) / 0.38;
  return 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, u));
}

function tuned(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

const POWER_STEPS = 32;
const POWER_A = new Float32Array(POWER_STEPS);
const POWER_B = new Float32Array(POWER_STEPS);
for (let i = 0; i < POWER_STEPS; i++) {
  const t = i / (POWER_STEPS - 1);
  const eased = t * t * (3 - 2 * t);
  POWER_A[i] = Math.cos((eased * Math.PI) / 2);
  POWER_B[i] = Math.sin((eased * Math.PI) / 2);
}

function cloneListenEar(ear: Ear): Ear {
  return { ...ear, left: { ...ear.left }, right: { ...ear.right } };
}

type EarBlend = {
  fromId: string;
  toId: string;
  fromEar: Ear;
  toEar: Ear;
  start: number;
  dur: number;
};

export class BathEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private predelay: DelayNode | null = null;
  private convolver: ConvolverNode | null = null;
  private air: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStreamAudioDestinationNode | null = null;
  private el: HTMLAudioElement | null = null;
  private voices = new Map<string, Voice>();
  private shared: AudioBufferSourceNode | null = null;
  private envMode: LoopMode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private irKey = "";
  private earlyGain: GainNode | null = null;
  private early: { delay: DelayNode; gain: GainNode; pan: StereoPannerNode }[] = [];
  private flutterDelay: DelayNode | null = null;
  private flutterFeedback: GainNode | null = null;
  private flutterOut: GainNode | null = null;
  private slapDelay: DelayNode | null = null;
  private slapGain: GainNode | null = null;
  private modeFilters: BiquadFilterNode[] = [];
  private modeGain: GainNode | null = null;
  private absorb: BiquadFilterNode | null = null;
  private bloom: BiquadFilterNode | null = null;
  private spaceDelay: DelayNode | null = null;
  private spaceGain: GainNode | null = null;
  private bedL: OscillatorNode | null = null;
  private bedR: OscillatorNode | null = null;
  private bedGain: GainNode | null = null;
  private timeBuf: Uint8Array<ArrayBuffer> | null = null;
  private running = false;
  private life = 0;
  private envToken = 0;
  private dipping = false;
  private output: OutputMode = "direct";
  private sessionBlocked = false;
  private volume = 0.84;
  private label = "Lumen Bath";
  private mediaHooked = false;
  private playToken = 0;
  private latest: {
    bowls: Bowl[];
    settings: Settings;
    label: string;
    receiver: Receiver;
    ears: Ear[];
    activeEarId: string;
    domes: Dome[];
  } | null = null;
  private receiver: Receiver = { ...DEFAULT_RECEIVER };
  private ears: Ear[] = [makeEar(DEFAULT_RECEIVER, "ear-1")];
  private domes: Dome[] = [];
  private activeEarId = "ear-1";
  private hearIn: GainNode | null = null;
  private hearOut: GainNode | null = null;
  private widthGain: GainNode | null = null;
  private outL: GainNode | null = null;
  private outR: GainNode | null = null;
  private spatialMerger: ChannelMergerNode | null = null;
  private spatialKey = "";
  private spatialIds: string[] = [];
  private recordBuffers: Float32Array[][] = [];
  private listenerAt = { x: 0, y: 1.3, z: 2 };
  private listenerForward = { x: 0, y: 0, z: -1 };
  private previewEarId: string | null = null;
  private heardId: string | null = null;
  private heardSnapshot: Ear | null = null;
  private listenerPinned = false;
  private blend: EarBlend | null = null;
  /** When set, a stem change fades only into the next one, and finishes before the next turn. */
  private cycleStep: number | null = null;
  private blendRaf = 0;
  private mixArmed = new Set<string>();
  private noise: AudioBufferSourceNode | null = null;
  private recording = false;
  private recordMode: "wav" | "webm" | null = null;
  private recordLeft: Float32Array[] = [];
  private recordRight: Float32Array[] = [];
  private recordSamples = 0;
  private recordRate = 48000;
  private recordNode: AudioWorkletNode | null = null;
  private recordSink: GainNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaChunks: Blob[] = [];
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  onTransport: ((playing: boolean) => void) | null = null;
  onNotice: ((message: string) => void) | null = null;
  onOutput: ((mode: OutputMode) => void) | null = null;
  onRecorded: ((blob: Blob, ext: string) => void) | null = null;

  isRunning(): boolean {
    return this.running;
  }

  contextState(): AudioContextState | "idle" {
    return this.ctx?.state ?? "idle";
  }

  fundHz(id?: string): number | null {
    const voice = id ? this.voices.get(id) : this.voices.values().next().value;
    if (!voice) return null;
    return voice.fund.frequency.value;
  }

  voiceCount(): number {
    return this.voices.size;
  }

  /** Finger sliding around the rim. Heard on this machine, which is the paired screen. */
  rim(id: string, amount: number): void {
    const voice = this.voices.get(id);
    if (!voice || !this.ctx) return;
    this.armRim(voice);
    const now = this.ctx.currentTime;
    const level = Math.min(1, Math.max(0, amount));
    voice.rimGain.gain.setTargetAtTime(Math.max(0.0001, level * 0.46), now, 0.03);
    voice.touchGain.gain.setTargetAtTime(Math.max(0.0001, level * 0.28), now, 0.05);
    const fund = voice.fund.frequency.value || 220;
    voice.rimFilter.frequency.setTargetAtTime(Math.min(this.ctx.sampleRate * 0.4, fund), now, 0.05);
    voice.rimFilter.Q.setTargetAtTime(5 + level * 9, now, 0.05);
    voice.touchFilter.frequency.setTargetAtTime(900 + level * 2800, now, 0.08);
  }

  /** A mallet tap. The strike rings on this machine. */
  gong(id: string, mallet: GongId): void {
    const voice = this.voices.get(id);
    if (!voice || !this.ctx || !isGong(mallet)) return;
    const now = this.ctx.currentTime;
    if (now - voice.lastGong < 0.16) return;
    voice.lastGong = now;
    this.armRim(voice);
    const spec = gongSpec(mallet);
    const tone = voice.touchGain.gain;
    tone.cancelScheduledValues(now);
    tone.setValueAtTime(0.0001, now);
    tone.exponentialRampToValueAtTime(spec.peak, now + spec.attack);
    tone.exponentialRampToValueAtTime(0.0001, now + spec.decay);
    voice.touchFilter.frequency.setValueAtTime(spec.bright, now);
    const rub = voice.rimGain.gain;
    rub.cancelScheduledValues(now);
    rub.setValueAtTime(0.0001, now);
    rub.exponentialRampToValueAtTime(Math.max(0.0001, spec.noise), now + spec.attack);
    rub.exponentialRampToValueAtTime(0.0001, now + Math.min(0.28, spec.decay * 0.35));
    const fund = voice.fund.frequency.value || 220;
    voice.rimFilter.frequency.setValueAtTime(Math.min(this.ctx.sampleRate * 0.4, fund), now);
    voice.rimFilter.Q.setValueAtTime(spec.q, now);
  }

  private noiseNode(): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    if (this.noise) return this.noise;
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      data[i] = last;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    this.noise = src;
    return src;
  }

  private armRim(voice: Voice): void {
    if (voice.rimArmed) return;
    const noise = this.noiseNode();
    if (!noise) return;
    noise.connect(voice.rimFilter);
    voice.rimFilter.connect(voice.rimGain);
    voice.rimArmed = true;
  }

  status(): string {
    return `${this.ctx?.state ?? "idle"}:${this.output}:${this.running ? "on" : "off"}:${this.voices.size}`;
  }

  readEnergy(): number {
    if (!this.analyser || !this.running || !this.timeBuf) return 0;
    this.analyser.getByteTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = (this.timeBuf[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.timeBuf.length) * 3.4);
  }

  listenerNow(): { x: number; y: number; z: number } {
    return { ...this.listenerAt };
  }

  forwardNow(): { x: number; y: number; z: number } {
    return { ...this.listenerForward };
  }

  isRecording(): boolean {
    return this.recording;
  }

  remember(bowls: Bowl[], settings: Settings, label: string, receiver: Receiver = this.receiver, ears?: Ear[], activeEarId?: string, domes?: Dome[]): void {
    this.adopt(receiver, ears, activeEarId);
    if (domes) this.domes = domes;
    this.stamp(bowls, settings, label);
    if (this.running) this.publishSession();
  }

  /** Stem being previewed as the ear you hear. Null hears ears[0]. */
  hearPreview(id: string | null): void {
    this.previewEarId = id && id.length > 0 ? id : null;
  }

  /** Seconds between stems while cycling. Null hears a manual mix instead of the cycle fade. */
  setCycleStep(seconds: number | null): void {
    this.cycleStep = seconds;
  }

  startFromGesture(
    bowls: Bowl[],
    settings: Settings,
    label: string,
    receiver: Receiver = this.receiver,
    ears?: Ear[],
    activeEarId?: string,
    domes?: Dome[],
  ): Promise<void> {
    try {
      this.life += 1;
      if (!this.ctx) this.createGraph();
      const ctx = this.ctx!;
      const pending = ctx.resume();
      this.running = true;
      this.volume = settings.volume;
      this.label = label;
      this.adopt(receiver, ears, activeEarId);
      if (domes) this.domes = domes;
      this.stamp(bowls, settings, label);
      this.hookOutput(settings.output);
      this.hookMediaSession();
      this.publishSession();
      const now = ctx.currentTime;
      this.master!.gain.cancelScheduledValues(now);
      this.master!.gain.setValueAtTime(0.0001, now);
      this.master!.gain.linearRampToValueAtTime(Math.max(0.0001, settings.volume), now + 0.08);
      this.sync(bowls, settings, label, receiver, ears, activeEarId, domes ?? this.domes);
      return pending.then(() => undefined);
    } catch (error) {
      this.running = false;
      this.onNotice?.(error instanceof Error ? error.message : "Audio could not start");
      return Promise.resolve();
    }
  }

  stop(): void {
    if (!this.ctx || !this.running) return;
    this.running = false;
    const token = ++this.life;
    const now = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setValueAtTime(Math.max(0.0001, this.master!.gain.value), now);
    this.master!.gain.linearRampToValueAtTime(0.0001, now + 0.12);
    this.publishSession();
    window.setTimeout(() => {
      if (token !== this.life) return;
      this.destroyVoices();
      void this.ctx?.suspend();
      this.el?.pause();
    }, 180);
  }

  setOutput(mode: OutputMode): void {
    if (mode === "session") this.sessionBlocked = false;
    if (!this.ctx || !this.running) return;
    this.hookOutput(mode);
  }

  sync(bowls: Bowl[], settings: Settings, label: string, receiver: Receiver = this.receiver, ears?: Ear[], activeEarId?: string, domes?: Dome[]): void {
    if (!this.running || !this.ctx || !this.master || !this.wet || !this.air) return;
    this.label = label;
    this.adopt(receiver, ears, activeEarId);
    if (domes) this.domes = domes;
    this.stamp(bowls, settings, label);
    this.volume = settings.volume;
    if (!this.dipping) this.approach(this.master.gain, Math.max(0.0001, settings.volume), 0.06);
    this.updateAcoustics(settings);
    this.approach(this.wet.gain, Math.max(0, Math.min(0.8, settings.wet)), 0.08);
    this.approach(this.air.gain, -7.5 * settings.air, 0.08);
    if (settings.output !== this.output && !(settings.output === "session" && this.sessionBlocked)) {
      this.hookOutput(settings.output);
    }
    this.placeListener(settings);
    this.updateBed(settings);
    this.reconcile(bowls, settings);
    this.refreshEnvelope(settings, bowls);
    this.publishSession();
  }

  private createGraph(): void {
    const ctx = new AudioContext({ latencyHint: "playback" });
    this.ctx = ctx;
    const bus = ctx.createGain();
    const dry = ctx.createGain();
    const predelay = ctx.createDelay(0.08);
    predelay.delayTime.value = 0.03;
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    const wetHigh = ctx.createBiquadFilter();
    wetHigh.type = "highpass";
    wetHigh.frequency.value = 170;
    wetHigh.Q.value = 0.7;
    const absorb = ctx.createBiquadFilter();
    absorb.type = "lowpass";
    absorb.frequency.value = 12000;
    absorb.Q.value = 0.7;
    const bloom = ctx.createBiquadFilter();
    bloom.type = "lowshelf";
    bloom.frequency.value = 140;
    bloom.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 28;
    hpf.Q.value = 0.7;
    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 7200;
    air.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -3;
    comp.knee.value = 6;
    comp.ratio.value = 18;
    comp.attack.value = 0.002;
    comp.release.value = 0.16;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.85;
    const earlyGain = ctx.createGain();
    earlyGain.gain.value = 0;
    const early = Array.from({ length: 6 }, () => {
      const delay = ctx.createDelay(0.5);
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      earlyGain.connect(delay);
      delay.connect(gain);
      gain.connect(pan);
      pan.connect(hpf);
      return { delay, gain, pan };
    });
    const flutterDelay = ctx.createDelay(0.08);
    const flutterFeedback = ctx.createGain();
    flutterFeedback.gain.value = 0;
    const flutterHp = ctx.createBiquadFilter();
    flutterHp.type = "highpass";
    flutterHp.frequency.value = 180;
    const flutterOut = ctx.createGain();
    flutterOut.gain.value = 0;
    const slapDelay = ctx.createDelay(0.4);
    const slapHp = ctx.createBiquadFilter();
    slapHp.type = "highpass";
    slapHp.frequency.value = 140;
    const slapGain = ctx.createGain();
    slapGain.gain.value = 0;
    const modeGain = ctx.createGain();
    modeGain.gain.value = 0;
    const modeFilters = [0, 1, 2].map(() => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.Q.value = 7;
      filter.gain.value = 0;
      filter.frequency.value = 90;
      return filter;
    });
    const spaceDelay = ctx.createDelay(0.05);
    const spaceGain = ctx.createGain();
    spaceGain.gain.value = 0;
    bus.connect(dry);
    bus.connect(predelay);
    predelay.connect(convolver);
    convolver.connect(wetHigh);
    wetHigh.connect(absorb);
    absorb.connect(bloom);
    bloom.connect(wet);
    dry.connect(hpf);
    wet.connect(hpf);
    wet.connect(spaceDelay);
    spaceDelay.connect(spaceGain);
    spaceGain.connect(hpf);
    bus.connect(earlyGain);
    bus.connect(flutterDelay);
    flutterDelay.connect(flutterFeedback);
    flutterFeedback.connect(flutterDelay);
    flutterDelay.connect(flutterHp);
    flutterHp.connect(flutterOut);
    flutterOut.connect(hpf);
    bus.connect(slapDelay);
    slapDelay.connect(slapHp);
    slapHp.connect(slapGain);
    slapGain.connect(hpf);
    bus.connect(modeGain);
    modeGain.connect(modeFilters[0]!);
    modeFilters[0]!.connect(modeFilters[1]!);
    modeFilters[1]!.connect(modeFilters[2]!);
    modeFilters[2]!.connect(hpf);
    hpf.connect(air);
    air.connect(comp);
    comp.connect(master);
    master.connect(analyser);
    this.bus = bus;
    this.dry = dry;
    this.wet = wet;
    this.predelay = predelay;
    this.convolver = convolver;
    this.air = air;
    this.master = master;
    this.analyser = analyser;
    this.earlyGain = earlyGain;
    this.early = early;
    this.flutterDelay = flutterDelay;
    this.flutterFeedback = flutterFeedback;
    this.flutterOut = flutterOut;
    this.slapDelay = slapDelay;
    this.slapGain = slapGain;
    this.modeFilters = modeFilters;
    this.modeGain = modeGain;
    this.absorb = absorb;
    this.bloom = bloom;
    this.spaceDelay = spaceDelay;
    this.spaceGain = spaceGain;
    this.timeBuf = new Uint8Array(analyser.fftSize);
    this.stream = ctx.createMediaStreamDestination();
    this.buildHear(ctx);
    const el = new Audio();
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.preload = "none";
    el.dataset.lumen = "session";
    el.srcObject = this.stream.stream;
    document.body.appendChild(el);
    this.el = el;
    this.updateAcoustics(DEFAULT_SETTINGS);
    document.addEventListener("visibilitychange", () => {
      if (!this.running || !this.ctx) return;
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (document.visibilityState === "visible" && this.output === "session" && this.el?.paused) {
        void this.el.play().catch(() => this.forceDirect());
      }
    });
  }

  private hookOutput(mode: OutputMode): void {
    if (!this.ctx || !this.analyser) return;
    this.output = mode;
    try {
      this.analyser.disconnect();
    } catch {
      /* not yet connected */
    }
    if (this.hearIn && this.hearOut) {
      this.analyser.connect(this.hearIn);
      this.hearOut.connect(this.ctx.destination);
    } else {
      this.analyser.connect(this.ctx.destination);
    }
    this.playToken += 1;
    this.el?.pause();
  }

  private forceDirect(): void {
    if (!this.ctx || !this.analyser || this.sessionBlocked) return;
    this.sessionBlocked = true;
    this.output = "direct";
    try {
      this.analyser.disconnect();
    } catch {
      /* already disconnected */
    }
    if (this.hearIn && this.hearOut) {
      this.analyser.connect(this.hearIn);
      this.hearOut.connect(this.ctx.destination);
    } else {
      this.analyser.connect(this.ctx.destination);
    }
    this.onOutput?.("direct");
    this.onNotice?.("Background session was blocked. Switched to direct output.");
  }

  private hookMediaSession(): void {
    if (this.mediaHooked || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    this.mediaHooked = true;
    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!this.running && this.latest) {
          this.sessionBlocked = false;
          this.startFromGesture(
            this.latest.bowls,
            this.latest.settings,
            this.latest.label,
            this.latest.receiver,
            this.latest.ears,
            this.latest.activeEarId,
            this.latest.domes,
          );
        }
        this.onTransport?.(true);
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        this.stop();
        this.onTransport?.(false);
      });
    } catch {
      /* some browsers reject a handler they don't support */
    }
  }

  private publishSession(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.label,
        artist: "Lumen Bath",
        album: "Crystal soundscape",
      });
      navigator.mediaSession.playbackState = this.running ? "playing" : "paused";
    } catch {
      /* metadata is optional */
    }
  }

  private updateAcoustics(settings: Settings): void {
    if (!this.ctx || !this.convolver || !this.absorb || !this.bloom || !this.earlyGain) return;
    if (!this.flutterDelay || !this.flutterFeedback || !this.flutterOut || !this.slapDelay || !this.slapGain) return;
    if (!this.modeGain || !this.spaceDelay || !this.spaceGain) return;
    const room = getRoom(settings.roomShape);
    const key = [
      room.id,
      Math.round(settings.hall * 12),
      Math.round(settings.decay * 12),
      Math.round(settings.diffusion * 8),
      Math.round(settings.absorption * 8),
    ].join(":");
    if (key !== this.irKey) {
      this.irKey = key;
      this.convolver.buffer = makeIr(this.ctx, settings);
    }
    this.approach(this.earlyGain.gain, Math.min(1, Math.max(0, settings.early)) * 0.48, 0.08);
    room.reflections.forEach((tap, index) => {
      const slot = this.early[index];
      if (!slot) return;
      this.approach(slot.delay.delayTime, tap.delay, 0.08);
      this.approach(slot.gain.gain, tap.gain, 0.08);
      this.approach(slot.pan.pan, tap.pan, 0.08);
    });
    this.approach(this.flutterDelay.delayTime, room.flutterSec, 0.1);
    this.approach(this.flutterFeedback.gain, Math.min(0.62, Math.max(0, settings.flutter) * 0.7), 0.08);
    this.approach(this.flutterOut.gain, Math.max(0, settings.flutter) * 0.32, 0.08);
    this.approach(this.slapDelay.delayTime, room.slapSec, 0.1);
    this.approach(this.slapGain.gain, Math.max(0, settings.slap) * 0.38, 0.08);
    this.modeFilters.forEach((filter, index) => {
      this.approach(filter.frequency, room.modesHz[index] ?? 90, 0.12);
      this.approach(filter.gain, Math.max(0, settings.modes) * 9, 0.1);
    });
    this.approach(this.modeGain.gain, 0.03 + Math.max(0, settings.modes) * 0.18, 0.08);
    const open = 1 - Math.min(1, Math.max(0, settings.absorption));
    this.approach(this.absorb.frequency, 620 + open * 15000, 0.1);
    this.approach(this.bloom.gain, Math.max(0, settings.bloom) * 8, 0.1);
    this.approach(this.spaceDelay.delayTime, 0.004 + Math.max(0, settings.space) * 0.018, 0.08);
    this.approach(this.spaceGain.gain, Math.max(0, settings.space) * 0.38, 0.08);
  }

  private updateBed(settings: Settings): void {
    if (!this.ctx) return;
    if (!settings.binaural) {
      if (this.bedGain) this.approach(this.bedGain.gain, 0, 0.08);
      return;
    }
    if (!this.bedL || !this.bedR || !this.bedGain) {
      const left = this.ctx.createOscillator();
      const right = this.ctx.createOscillator();
      left.type = "sine";
      right.type = "sine";
      const panL = this.ctx.createStereoPanner();
      const panR = this.ctx.createStereoPanner();
      panL.pan.value = -1;
      panR.pan.value = 1;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      left.connect(panL);
      right.connect(panR);
      panL.connect(gain);
      panR.connect(gain);
      gain.connect(this.dry!);
      const t = this.ctx.currentTime + 0.02;
      left.start(t);
      right.start(t);
      this.bedL = left;
      this.bedR = right;
      this.bedGain = gain;
    }
    const base = tuned(settings.binauralCarrier, settings.transpose);
    this.approach(this.bedL.frequency, base, 0.08);
    this.approach(this.bedR.frequency, base + settings.binauralBeat, 0.08);
    this.approach(this.bedGain.gain, 0.01 + settings.binauralLevel * 0.04, 0.1);
  }

  private reconcile(bowls: Bowl[], settings: Settings): void {
    const ids = new Set(bowls.map((bowl) => bowl.id));
    for (const [id, voice] of this.voices) {
      if (!ids.has(id)) this.releaseVoice(voice);
    }
    const audible = Math.max(
      1,
      bowls.reduce((total, item) => total + (item.muted ? 0 : 1), 0),
    );
    bowls.forEach((bowl) => {
      let voice = this.voices.get(bowl.id);
      if (!voice) {
        voice = this.createVoice(bowl);
        this.voices.set(bowl.id, voice);
        this.armVoice(voice);
      }
      this.updateVoice(voice, bowl, settings, audible);
    });
  }

  private createVoice(bowl: Bowl): Voice {
    const ctx = this.ctx!;
    const mix = ctx.createGain();
    const level = ctx.createGain();
    level.gain.value = 0;
    const singGain = ctx.createGain();
    singGain.gain.value = 1;
    const phraseGain = ctx.createGain();
    phraseGain.gain.value = 0;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "lowpass";
    airFilter.frequency.value = 14000;
    airFilter.Q.value = 0.7;
    const panner = this.makePanner();
    const panGain = ctx.createGain();
    panGain.gain.value = 1;
    const arrive = ctx.createGain();
    arrive.gain.value = 1;
    const fund = ctx.createOscillator();
    fund.type = "sine";
    const fundGain = ctx.createGain();
    fundGain.gain.value = 0.75;
    fund.connect(fundGain);
    fundGain.connect(mix);
    const partials: OscillatorNode[] = [];
    const partialGains: GainNode[] = [];
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(mix);
      partials.push(osc);
      partialGains.push(gain);
    }
    const shadow = ctx.createOscillator();
    shadow.type = "sine";
    const shadowGain = ctx.createGain();
    shadowGain.gain.value = 0;
    shadow.connect(shadowGain);
    shadowGain.connect(mix);
    const shimmer: OscillatorNode[] = [];
    const shimmerGains: GainNode[] = [];
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(mix);
      shimmer.push(osc);
      shimmerGains.push(gain);
    }
    const singLfo = ctx.createOscillator();
    singLfo.type = "sine";
    singLfo.frequency.value = 0.2;
    const modDepth = ctx.createGain();
    modDepth.gain.value = 0;
    singLfo.connect(modDepth);
    modDepth.connect(singGain.gain);
    const driftLfo = ctx.createOscillator();
    driftLfo.type = "sine";
    driftLfo.frequency.value = 0.03 + Math.random() * 0.045;
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 1.5;
    driftLfo.connect(driftDepth);
    const oscs = [fund, ...partials, shadow, ...shimmer];
    for (const osc of oscs) driftDepth.connect(osc.detune);
    mix.connect(level);
    level.connect(singGain);
    singGain.connect(phraseGain);
    phraseGain.connect(airFilter);
    airFilter.connect(panGain);
    panGain.connect(arrive);
    arrive.connect(panner);
    const collect = ctx.createGain();
    collect.gain.value = 1;
    const delayL = ctx.createDelay(0.25);
    const delayR = ctx.createDelay(0.25);
    const lowL = ctx.createBiquadFilter();
    const lowR = ctx.createBiquadFilter();
    lowL.type = "lowpass";
    lowR.type = "lowpass";
    lowL.frequency.value = 8000;
    lowR.frequency.value = 8000;
    const mouthL = ctx.createGain();
    const mouthR = ctx.createGain();
    mouthL.gain.value = 0.4;
    mouthR.gain.value = 0.4;
    const earsMerge = ctx.createChannelMerger(2);
    airFilter.connect(collect);
    collect.connect(delayL);
    collect.connect(delayR);
    delayL.connect(lowL);
    delayR.connect(lowR);
    lowL.connect(mouthL);
    lowR.connect(mouthR);
    mouthL.connect(earsMerge, 0, 0);
    mouthR.connect(earsMerge, 0, 1);
    earsMerge.connect(this.bus!);
    const touchGain = ctx.createGain();
    touchGain.gain.value = 0;
    const touchFilter = ctx.createBiquadFilter();
    touchFilter.type = "lowpass";
    touchFilter.frequency.value = 2400;
    const rimGain = ctx.createGain();
    rimGain.gain.value = 0;
    const rimFilter = ctx.createBiquadFilter();
    rimFilter.type = "bandpass";
    rimFilter.frequency.value = 220;
    rimFilter.Q.value = 6;
    mix.connect(touchGain);
    touchGain.connect(touchFilter);
    touchFilter.connect(panGain);
    touchFilter.connect(collect);
    rimGain.connect(panGain);
    rimGain.connect(collect);
    const when = ctx.currentTime + 0.02;
    for (const osc of oscs) osc.start(when);
    singLfo.start(when);
    driftLfo.start(when);
    const beatMul = 0.84 + (hashId(bowl.id) % 5) * 0.08;
    return {
      id: bowl.id,
      mix,
      level,
      singGain,
      phraseGain,
      air: airFilter,
      panner,
      panGain,
      arrive,
      collect,
      delayL,
      delayR,
      lowL,
      lowR,
      mouthL,
      mouthR,
      altGain: null,
      altPanner: null,
      fund,
      fundGain,
      partials,
      partialGains,
      shadow,
      shadowGain,
      shimmer,
      shimmerGains,
      singLfo,
      modDepth,
      driftLfo,
      driftDepth,
      env: null,
      envAttached: false,
      beatMul,
      touchGain,
      touchFilter,
      rimGain,
      rimFilter,
      rimArmed: false,
      lastGong: 0,
    };
  }

  private updateVoice(voice: Voice, bowl: Bowl, settings: Settings, count: number): void {
    const nyquist = this.ctx!.sampleRate * 0.46;
    const fundHz = tuned(bowl.frequency, settings.transpose);
    this.approach(voice.fund.frequency, fundHz, 0.045);
    const glass = GLASS[bowl.glass];
    const width = Math.min(1, Math.max(0.36, bowl.size));
    const height = Math.min(1, Math.max(0.22, Number.isFinite(bowl.height) ? bowl.height : 0.5));
    const brightness = 1.08 - width * 0.5 + (1 - height) * 0.26;
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const partial = glass.partials[i];
      const gain = voice.partialGains[i]!;
      const osc = voice.partials[i]!;
      if (!partial) {
        this.approach(gain.gain, 0, 0.06);
        continue;
      }
      const freq = fundHz * partial.ratio;
      if (freq > nyquist) {
        this.approach(gain.gain, 0, 0.05);
        continue;
      }
      this.approach(osc.frequency, freq, 0.045);
      const band = partial.ratio < 2.5 ? 1 : 0.42 + (1 - height) * 0.75;
      this.approach(gain.gain, partial.gain * brightness * band, 0.08);
    }
    const beat = Math.max(0.08, settings.veilHz) * voice.beatMul;
    this.approach(voice.shadow.frequency, Math.min(nyquist, fundHz + beat), 0.05);
    this.approach(voice.shadowGain.gain, settings.veil * 0.36, 0.08);
    const shimRatios = [2.003, 3.009];
    const shimAmps = [0.04, 0.016];
    shimRatios.forEach((ratio, index) => {
      const freq = fundHz * ratio;
      const gainNode = voice.shimmerGains[index]!;
      if (freq > nyquist || settings.shimmer <= 0.001) {
        this.approach(gainNode.gain, 0, 0.08);
        return;
      }
      this.approach(voice.shimmer[index]!.frequency, freq, 0.05);
      this.approach(gainNode.gain, settings.shimmer * shimAmps[index]! * brightness, 0.08);
    });
    const depth = bowl.sing * 0.18 * (0.62 + height * 0.55 + width * 0.12);
    this.approach(voice.modDepth.gain, depth, 0.12);
    const rub = Math.max(0.05, (0.07 + bowl.sing * 0.48) * (1.55 - height * 0.7));
    this.approach(voice.singLfo.frequency, rub, 0.2);
    this.approach(voice.driftDepth.gain, 1.1 + bowl.sing * 4.2, 0.2);
    const active = Math.max(1, count);
    const head = 0.5 / Math.sqrt(active);
    const sizeLoud = 0.68 + width * 0.24 + height * 0.18;
    const level = bowl.muted ? 0 : bowl.gain * sizeLoud * head;
    this.approach(voice.level.gain, level, 0.05);
    this.approach(voice.fundGain.gain, 0.46 + height * 0.46 + width * 0.06, 0.08);
    const placed = bowlPoint({ x: bowl.x, y: bowl.y, size: width, height, gain: bowl.gain }, settings);
    const ear = this.listenerAt;
    const dist = Math.hypot(placed.x - ear.x, placed.y - ear.y, placed.z - ear.z);
    const loss = Math.min(1, Math.max(0, settings.airLoss));
    const cutoff = 16000 - loss * (5200 + dist * 780);
    this.approach(voice.air.frequency, Math.min(16000, Math.max(700, cutoff)), 0.08);
    if (this.listenerPinned && this.blend) {
      this.ensureAlt(voice);
      this.placeRelative(voice, placed, settings, false);
      if (!this.mixArmed.has(voice.id)) {
        this.armMix(voice);
        this.mixArmed.add(voice.id);
      }
    } else {
      this.approach(voice.panner.positionX, placed.x, 0.025);
      this.approach(voice.panner.positionY, placed.y, 0.025);
      this.approach(voice.panner.positionZ, placed.z, 0.025);
    }
    voice.panner.refDistance = 0.75 + width * 1.55;
    voice.panner.rolloffFactor = Math.max(0.3, 1.1 - width * 0.58);
    if (voice.altPanner) {
      voice.altPanner.refDistance = voice.panner.refDistance;
      voice.altPanner.rolloffFactor = voice.panner.rolloffFactor;
    }
    this.placeTaps(voice, placed, bowl.frequency);
    this.applyMouths(voice, placed, settings, bowl.frequency);
  }

  /** Each horn is a mic. Left and right stay on their own sides, including bounce paths they face. */
  private applyMouths(voice: Voice, source: { x: number; y: number; z: number }, settings: Settings, frequency: number): void {
    const mix = this.blend && this.ctx ? this.mixNow(Math.max(this.ctx.currentTime, this.blend.start)) : { a: 0, b: 1 };
    const from = this.blend ? (this.ears.find((item) => item.id === this.blend!.fromId) ?? this.blend.fromEar) : null;
    const to = this.blend ? (this.ears.find((item) => item.id === this.blend!.toId) ?? this.blend.toEar) : this.resolveTarget();
    const left = this.mixedCatch(source, from, to, "left", settings, mix, frequency);
    const right = this.mixedCatch(source, from, to, "right", settings, mix, frequency);
    this.approach(voice.mouthL.gain, left.level, 0.05);
    this.approach(voice.mouthR.gain, right.level, 0.05);
    this.approach(voice.delayL.delayTime, left.delay, 0.07);
    this.approach(voice.delayR.delayTime, right.delay, 0.07);
    this.approach(voice.lowL.frequency, left.cutoff, 0.07);
    this.approach(voice.lowR.frequency, right.cutoff, 0.07);
  }

  private mixedCatch(
    source: { x: number; y: number; z: number },
    from: Ear | null,
    to: Ear,
    side: "left" | "right",
    settings: Settings,
    mix: { a: number; b: number },
    frequency: number,
  ) {
    const next = this.sideCatch(source, to, side, settings, frequency);
    if (!from || mix.a < 0.001) return next;
    const prev = this.sideCatch(source, from, side, settings, frequency);
    return {
      level: prev.level * mix.a + next.level * mix.b,
      delay: prev.delay * mix.a + next.delay * mix.b,
      cutoff: prev.cutoff * mix.a + next.cutoff * mix.b,
    };
  }

  private sideCatch(source: { x: number; y: number; z: number }, ear: Ear, side: "left" | "right", settings: Settings, frequency = 220) {
    const part = ear[side];
    const mouth = hornMouth(ear, part, settings);
    const ceilings = domeCeilings(source, frequency, this.domes, settings);
    return gatherCone(source, mouth, hornYaw(ear, part, settings), hornPitch(ear, part), part.size, part.gain, settings, ceilings);
  }

  private releaseVoice(voice: Voice): void {
    if (!this.ctx) return;
    this.disarm(voice);
    const now = this.ctx.currentTime;
    this.approach(voice.level.gain, 0, 0.03);
    const stopAt = now + 0.16;
    this.stopVoiceNodes(voice, stopAt);
    this.voices.delete(voice.id);
    window.setTimeout(() => {
      try {
        voice.mix.disconnect();
        voice.altGain?.disconnect();
        voice.altPanner?.disconnect();
      } catch {
        /* already gone */
      }
    }, 220);
  }

  private stopVoiceNodes(voice: Voice, when: number): void {
    const oscs = [
      voice.fund,
      ...voice.partials,
      voice.shadow,
      ...voice.shimmer,
      voice.singLfo,
      voice.driftLfo,
    ];
    for (const osc of oscs) {
      try {
        osc.stop(when);
      } catch {
        /* already stopped */
      }
    }
    if (voice.env) {
      try {
        voice.env.stop(when);
      } catch {
        /* already stopped */
      }
      voice.env = null;
    }
  }

  private refreshEnvelope(settings: Settings, bowls: Bowl[]): void {
    const mode = settings.loopMode;
    if (this.envMode === null) {
      this.envMode = mode;
      this.attachAll(settings, bowls);
      return;
    }
    if (mode !== this.envMode) {
      this.envMode = mode;
      this.dip(() => {
        this.detachAll();
        this.attachAll(settings, bowls);
      });
      return;
    }
    bowls.forEach((bowl, index) => {
      const voice = this.voices.get(bowl.id);
      if (voice && !voice.envAttached) this.attachOne(voice, settings, index, bowl.size);
    });
    this.updateRates(settings, bowls);
  }

  private attachAll(settings: Settings, bowls: Bowl[]): void {
    if (settings.loopMode === "breath" || settings.loopMode === "tide") this.ensureShared(settings);
    bowls.forEach((bowl, index) => {
      const voice = this.voices.get(bowl.id);
      if (!voice) return;
      voice.envAttached = false;
      this.attachOne(voice, settings, index, bowl.size);
    });
  }

  private attachOne(voice: Voice, settings: Settings, index: number, size: number): void {
    if (!this.ctx || voice.envAttached) return;
    const now = this.ctx.currentTime;
    const mode = settings.loopMode;
    if (mode === "continuous") {
      voice.phraseGain.gain.cancelScheduledValues(now);
      voice.phraseGain.gain.setValueAtTime(0.0001, now);
      voice.phraseGain.gain.linearRampToValueAtTime(1, now + 0.08);
      voice.envAttached = true;
      return;
    }
    voice.phraseGain.gain.cancelScheduledValues(now);
    voice.phraseGain.gain.setValueAtTime(0, now);
    if (mode === "breath" || mode === "tide") {
      this.ensureShared(settings);
      this.shared?.connect(voice.phraseGain.gain);
      voice.envAttached = true;
      return;
    }
    const src = this.makeLoop(mode, settings.period, index, size);
    src.connect(voice.phraseGain.gain);
    voice.env = src;
    voice.envAttached = true;
  }

  private ensureShared(settings: Settings): void {
    if (this.shared || !this.ctx) return;
    if (settings.loopMode !== "breath" && settings.loopMode !== "tide") return;
    const buffer = this.envelopeBuffer(settings.loopMode);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = buffer.duration / Math.max(2, settings.period);
    src.start(this.ctx.currentTime);
    this.shared = src;
  }

  private makeLoop(kind: LoopMode, period: number, index: number, size: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = this.envelopeBuffer(kind);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const stretch = 0.72 + size * 0.7;
    src.playbackRate.value = buffer.duration / Math.max(2, period) / stretch;
    const frac = (index * (kind === "canon" ? 0.61803398875 : 0.38196601125)) % 1;
    src.start(ctx.currentTime, frac * buffer.duration);
    return src;
  }

  private envelopeBuffer(kind: LoopMode): AudioBuffer {
    const cached = this.buffers.get(kind);
    if (cached) return cached;
    const ctx = this.ctx!;
    const seconds = kind === "mallet" ? 2 : 4;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = envelopeShape(kind, i / (length - 1));
    this.buffers.set(kind, buffer);
    return buffer;
  }

  private updateRates(settings: Settings, bowls: Bowl[]): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.shared?.buffer && (settings.loopMode === "breath" || settings.loopMode === "tide")) {
      const rate = this.shared.buffer.duration / Math.max(2, settings.period);
      this.approach(this.shared.playbackRate, rate, 0.12);
    }
    if (settings.loopMode !== "mallet" && settings.loopMode !== "canon") return;
    bowls.forEach((bowl) => {
      const voice = this.voices.get(bowl.id);
      if (!voice?.env?.buffer) return;
      const stretch = 0.72 + bowl.size * 0.7;
      const rate = voice.env.buffer.duration / Math.max(2, settings.period) / stretch;
      this.approach(voice.env.playbackRate, rate, 0.12);
    });
  }

  private detachAll(): void {
    if (this.shared) {
      try {
        this.shared.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.shared.disconnect();
      } catch {
        /* already disconnected */
      }
      this.shared = null;
    }
    for (const voice of this.voices.values()) {
      if (voice.env) {
        try {
          voice.env.stop();
        } catch {
          /* already stopped */
        }
        try {
          voice.env.disconnect();
        } catch {
          /* already disconnected */
        }
        voice.env = null;
      }
      voice.envAttached = false;
    }
  }

  private dip(fn: () => void): void {
    if (!this.ctx || !this.master) {
      fn();
      return;
    }
    const token = ++this.envToken;
    this.dipping = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    window.setTimeout(() => {
      if (token !== this.envToken || !this.running || !this.ctx || !this.master) {
        this.dipping = false;
        return;
      }
      fn();
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0.0001, t);
      this.master.gain.linearRampToValueAtTime(Math.max(0.0001, this.volume), t + 0.12);
      this.dipping = false;
    }, 60);
  }

  private destroyVoices(): void {
    this.detachAll();
    this.clearBlend();
    const when = this.ctx ? this.ctx.currentTime + 0.02 : 0;
    for (const voice of this.voices.values()) this.stopVoiceNodes(voice, when);
    this.voices.clear();
    this.envMode = null;
    if (this.noise) {
      try {
        this.noise.stop();
      } catch {
        /* already stopped */
      }
      this.noise = null;
    }
    if (this.bedL) {
      try {
        this.bedL.stop();
        this.bedR?.stop();
      } catch {
        /* already stopped */
      }
      this.bedL = null;
      this.bedR = null;
      this.bedGain = null;
    }
  }

  private placeListener(settings: Settings): void {
    if (!this.ctx) return;
    const target = this.resolveTarget();
    const blend = this.blend;
    if (blend) {
      if (target.id === blend.toId) {
        this.poseBlendVoices(settings, false);
        return;
      }
      const from = this.ears.find((item) => item.id === blend.toId) ?? blend.toEar;
      this.finishBlend();
      this.beginMix(from, target, settings);
      return;
    }
    if (this.heardId && this.heardId !== target.id) {
      const from = this.heardSnapshot ?? this.ears.find((item) => item.id === this.heardId) ?? target;
      if (from.id !== target.id) {
        this.beginMix(from, target, settings);
        return;
      }
    }
    this.heardId = target.id;
    this.heardSnapshot = cloneListenEar(target);
    this.placeWorld(target, settings);
  }

  private resolveTarget(): Ear {
    const primary = this.ears[0] ?? makeEar(this.receiver, "ear-1");
    if (!this.previewEarId || this.previewEarId === primary.id) return primary;
    return this.ears.find((item) => item.id === this.previewEarId) ?? primary;
  }

  private placeWorld(ear: Ear, settings: Settings): void {
    const placed = listenPoint(ear, settings);
    this.listenerAt = placed;
    const yaw = facingYaw(ear, settings);
    const pitch = listenPitch(ear);
    const forward = listenForward(yaw, pitch);
    const up = listenUp(yaw, pitch);
    this.listenerForward = forward;
    if (!this.ctx?.listener.positionX) return;
    const listener = this.ctx.listener;
    this.approach(listener.positionX, placed.x, 0.09);
    this.approach(listener.positionY, placed.y, 0.09);
    this.approach(listener.positionZ, placed.z, 0.09);
    this.approach(listener.forwardX, forward.x, 0.07);
    this.approach(listener.forwardY, forward.y, 0.07);
    this.approach(listener.forwardZ, forward.z, 0.07);
    this.approach(listener.upX, up.x, 0.07);
    this.approach(listener.upY, up.y, 0.07);
    this.approach(listener.upZ, up.z, 0.07);
    this.applySpread(ear);
  }

  private beginMix(from: Ear, to: Ear, settings: Settings): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = this.cycleStep == null ? 0.82 : cycleFadeSeconds(this.cycleStep);
    this.blend = {
      fromId: from.id,
      toId: to.id,
      fromEar: cloneListenEar(from),
      toEar: cloneListenEar(to),
      start: now + 0.012,
      dur,
    };
    this.mixArmed.clear();
    if (!this.listenerPinned) {
      this.pinListener(0, 0, 0, 0, -1);
      this.listenerPinned = true;
    }
    this.poseBlendVoices(settings, true);
    for (const voice of this.voices.values()) {
      this.armMix(voice);
      this.mixArmed.add(voice.id);
    }
    this.kickPaint();
  }

  /** Drop the quieter path and land on one ear, so the next mix starts clean. */
  private collapseBlend(settings: Settings): void {
    const blend = this.blend;
    if (!blend || !this.ctx) return;
    const now = this.ctx.currentTime;
    const mix = this.mixNow(now);
    const ear =
      mix.b > mix.a
        ? (this.ears.find((item) => item.id === blend.toId) ?? blend.toEar)
        : (this.ears.find((item) => item.id === blend.fromId) ?? blend.fromEar);
    this.blend = null;
    cancelAnimationFrame(this.blendRaf);
    this.listenerPinned = false;
    this.mixArmed.clear();
    const placed = listenPoint(ear, settings);
    const yaw = facingYaw(ear, settings);
    const forward = listenForward(yaw, listenPitch(ear));
    const up = listenUp(yaw, listenPitch(ear));
    this.pinListener(placed.x, placed.y, placed.z, forward.x, forward.z, forward.y, up.x, up.y, up.z);
    this.listenerAt = placed;
    this.listenerForward = forward;
    this.heardId = ear.id;
    this.heardSnapshot = cloneListenEar(ear);
    for (const voice of this.voices.values()) {
      const bowl = this.latest?.bowls.find((item) => item.id === voice.id);
      if (bowl) {
        const world = bowlPoint(
          { x: bowl.x, y: bowl.y, size: bowl.size, height: bowl.height, gain: bowl.gain },
          settings,
        );
        this.setParamNow(voice.panner.positionX, world.x);
        this.setParamNow(voice.panner.positionY, world.y);
        this.setParamNow(voice.panner.positionZ, world.z);
      }
      this.setParamNow(voice.panGain.gain, 1);
      if (voice.altGain) this.setParamNow(voice.altGain.gain, 0);
    }
    this.applySpread(ear);
  }

  private finishBlend(): void {
    const blend = this.blend;
    if (!blend || !this.ctx) return;
    const settings = this.latest?.settings ?? DEFAULT_SETTINGS;
    const settle = this.ears.find((item) => item.id === blend.toId) ?? blend.toEar;
    this.blend = null;
    cancelAnimationFrame(this.blendRaf);
    this.listenerPinned = false;
    this.mixArmed.clear();
    const placed = listenPoint(settle, settings);
    const yaw = facingYaw(settle, settings);
    const forward = listenForward(yaw, listenPitch(settle));
    const up = listenUp(yaw, listenPitch(settle));
    this.pinListener(placed.x, placed.y, placed.z, forward.x, forward.z, forward.y, up.x, up.y, up.z);
    this.listenerAt = placed;
    this.listenerForward = forward;
    this.heardId = settle.id;
    this.heardSnapshot = cloneListenEar(settle);
    for (const voice of this.voices.values()) {
      const bowl = this.latest?.bowls.find((item) => item.id === voice.id);
      if (bowl) {
        const world = bowlPoint(
          { x: bowl.x, y: bowl.y, size: bowl.size, height: bowl.height, gain: bowl.gain },
          settings,
        );
        this.setParamNow(voice.panner.positionX, world.x);
        this.setParamNow(voice.panner.positionY, world.y);
        this.setParamNow(voice.panner.positionZ, world.z);
      }
      this.setParamNow(voice.panGain.gain, 1);
      if (voice.altGain) this.setParamNow(voice.altGain.gain, 0);
    }
    this.applySpread(settle);
  }

  private clearBlend(): void {
    cancelAnimationFrame(this.blendRaf);
    this.blend = null;
    this.listenerPinned = false;
    this.mixArmed.clear();
    this.heardId = null;
    this.heardSnapshot = null;
  }

  private mixNow(now: number): { a: number; b: number } {
    if (!this.blend) return { a: 1, b: 0 };
    const u = Math.min(1, Math.max(0, (now - this.blend.start) / this.blend.dur));
    const eased = u * u * (3 - 2 * u);
    return { a: Math.cos((eased * Math.PI) / 2), b: Math.sin((eased * Math.PI) / 2) };
  }

  private armMix(voice: Voice): void {
    if (!this.blend || !this.ctx) return;
    this.ensureAlt(voice);
    if (!voice.altGain) return;
    const now = this.ctx.currentTime;
    const end = this.blend.start + this.blend.dur;
    const current = this.mixNow(Math.max(now, this.blend.start));
    const late = now > this.blend.start + 0.04;
    const gA = voice.panGain.gain;
    const gB = voice.altGain.gain;
    gA.cancelScheduledValues(now);
    gB.cancelScheduledValues(now);
    gA.setValueAtTime(Math.max(0.0001, current.a), now);
    gB.setValueAtTime(Math.max(0.0001, current.b), now);
    if (late) {
      gA.linearRampToValueAtTime(0.0001, Math.max(now + 0.05, end));
      gB.linearRampToValueAtTime(1, Math.max(now + 0.05, end));
      return;
    }
    try {
      gA.setValueCurveAtTime(POWER_A, this.blend.start, this.blend.dur);
      gB.setValueCurveAtTime(POWER_B, this.blend.start, this.blend.dur);
    } catch {
      gA.linearRampToValueAtTime(0.0001, end);
      gB.linearRampToValueAtTime(1, end);
    }
  }

  private poseBlendVoices(settings: Settings, immediate: boolean): void {
    if (!this.blend || !this.latest) return;
    for (const bowl of this.latest.bowls) {
      const voice = this.voices.get(bowl.id);
      if (!voice) continue;
      const placed = bowlPoint(
        { x: bowl.x, y: bowl.y, size: bowl.size, height: bowl.height, gain: bowl.gain },
        settings,
      );
      this.ensureAlt(voice);
      this.placeRelative(voice, placed, settings, immediate);
    }
  }

  private placeRelative(
    voice: Voice,
    placed: { x: number; y: number; z: number },
    settings: Settings,
    immediate: boolean,
  ): void {
    const blend = this.blend;
    if (!blend) return;
    const from = this.ears.find((item) => item.id === blend.fromId) ?? blend.fromEar;
    const to = this.ears.find((item) => item.id === blend.toId) ?? blend.toEar;
    const a = hearRelative(placed, from, settings);
    const b = hearRelative(placed, to, settings);
    this.putPanner(voice.panner, a, immediate);
    if (voice.altPanner) this.putPanner(voice.altPanner, b, immediate);
  }

  private putPanner(panner: PannerNode, at: { x: number; y: number; z: number }, immediate: boolean): void {
    if (immediate) {
      this.setParamNow(panner.positionX, at.x);
      this.setParamNow(panner.positionY, at.y);
      this.setParamNow(panner.positionZ, at.z);
      return;
    }
    this.approach(panner.positionX, at.x, 0.03);
    this.approach(panner.positionY, at.y, 0.03);
    this.approach(panner.positionZ, at.z, 0.03);
  }

  private ensureAlt(voice: Voice): void {
    if (voice.altPanner || !this.ctx || !this.bus) return;
    const altGain = this.ctx.createGain();
    altGain.gain.value = 0;
    const alt = this.makePanner();
    voice.air.connect(altGain);
    altGain.connect(alt);
    voice.altGain = altGain;
    voice.altPanner = alt;
  }

  private makePanner(): PannerNode {
    const panner = this.ctx!.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.4;
    panner.maxDistance = 48;
    panner.rolloffFactor = 0.75;
    panner.coneInnerAngle = 210;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0.78;
    panner.orientationX.value = 0;
    panner.orientationY.value = 1;
    panner.orientationZ.value = 0;
    return panner;
  }

  private pinListener(
    x: number,
    y: number,
    z: number,
    fx: number,
    fz: number,
    fy = 0,
    ux = 0,
    uy = 1,
    uz = 0,
  ): void {
    if (!this.ctx?.listener.positionX) return;
    const listener = this.ctx.listener;
    this.setParamNow(listener.positionX, x);
    this.setParamNow(listener.positionY, y);
    this.setParamNow(listener.positionZ, z);
    this.setParamNow(listener.forwardX, fx);
    this.setParamNow(listener.forwardY, fy);
    this.setParamNow(listener.forwardZ, fz);
    this.setParamNow(listener.upX, ux);
    this.setParamNow(listener.upY, uy);
    this.setParamNow(listener.upZ, uz);
  }

  private setParamNow(param: AudioParam, value: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    try {
      param.setValueAtTime(value, t);
    } catch {
      param.value = value;
    }
  }

  private kickPaint(): void {
    cancelAnimationFrame(this.blendRaf);
    this.blendRaf = requestAnimationFrame(() => this.paintBlend());
  }

  private paintBlend(): void {
    const blend = this.blend;
    if (!blend || !this.ctx) return;
    const settings = this.latest?.settings ?? DEFAULT_SETTINGS;
    const now = this.ctx.currentTime;
    const u = Math.min(1, Math.max(0, (now - blend.start) / blend.dur));
    if (u >= 1) {
      this.finishBlend();
      return;
    }
    const from = this.ears.find((item) => item.id === blend.fromId) ?? blend.fromEar;
    const to = this.ears.find((item) => item.id === blend.toId) ?? blend.toEar;
    const eased = u * u * (3 - 2 * u);
    const a = listenPoint(from, settings);
    const b = listenPoint(to, settings);
    this.listenerAt = {
      x: a.x + (b.x - a.x) * eased,
      y: a.y + (b.y - a.y) * eased,
      z: a.z + (b.z - a.z) * eased,
    };
    const yawA = facingYaw(from, settings);
    let turn = facingYaw(to, settings) - yawA;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const yaw = yawA + turn * eased;
    const pitch = listenPitch(from) + (listenPitch(to) - listenPitch(from)) * eased;
    this.listenerForward = listenForward(yaw, pitch);
    if (this.widthGain && this.outL && this.outR) {
      const left = this.spreadOf(from);
      const right = this.spreadOf(to);
      this.approach(this.widthGain.gain, left.width + (right.width - left.width) * eased, 0.05);
      this.approach(this.outL.gain, left.l + (right.l - left.l) * eased, 0.05);
      this.approach(this.outR.gain, left.r + (right.r - left.r) * eased, 0.05);
    }
    this.blendRaf = requestAnimationFrame(() => this.paintBlend());
  }

  private spreadOf(ear: Ear): { width: number; l: number; r: number } {
    const span = Math.hypot(ear.right.x - ear.left.x, ear.right.y - ear.left.y, ear.right.z - ear.left.z);
    return {
      width: Math.min(2.2, Math.max(0.35, span / 0.24)),
      l: Math.min(1.7, Math.max(0, coneGain(ear.left) * (1 + ear.left.y * 0.9))),
      r: Math.min(1.7, Math.max(0, coneGain(ear.right) * (1 + ear.right.y * 0.9))),
    };
  }

  private applySpread(ear: Ear): void {
    if (!this.ctx || !this.widthGain || !this.outL || !this.outR) return;
    const spread = this.spreadOf(ear);
    this.approach(this.widthGain.gain, spread.width, 0.04);
    this.approach(this.outL.gain, spread.l, 0.04);
    this.approach(this.outR.gain, spread.r, 0.04);
  }

  private stamp(bowls: Bowl[], settings: Settings, label: string): void {
    this.label = label;
    this.latest = {
      bowls,
      settings,
      label,
      receiver: this.receiver,
      ears: this.ears,
      activeEarId: this.activeEarId,
      domes: this.domes,
    };
  }

  private adopt(receiver: Receiver, ears?: Ear[], activeEarId?: string): void {
    this.receiver = receiver;
    if (!ears || ears.length === 0) {
      if (this.ears.length === 0) this.ears = [makeEar(receiver, "ear-1")];
      const active = this.ears.find((item) => item.id === this.activeEarId) ?? this.ears[0]!;
      const next = { ...active, x: receiver.x, y: receiver.y, height: receiver.height, yaw: receiver.yaw, pitch: earPitch(receiver) };
      this.ears = this.ears.map((item) => (item.id === next.id ? next : item));
      return;
    }
    this.ears = ears;
    this.activeEarId = ears.some((item) => item.id === activeEarId) ? activeEarId! : ears[0]!.id;
    const active = ears.find((item) => item.id === this.activeEarId) ?? ears[0]!;
    this.receiver = { x: active.x, y: active.y, height: active.height, yaw: active.yaw, pitch: earPitch(active) };
  }

  private buildHear(ctx: AudioContext): void {
    const input = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    const mid = ctx.createGain();
    const side = ctx.createGain();
    const midL = ctx.createGain();
    const midR = ctx.createGain();
    const sideL = ctx.createGain();
    const sideR = ctx.createGain();
    midL.gain.value = 0.5;
    midR.gain.value = 0.5;
    sideL.gain.value = 0.5;
    sideR.gain.value = -0.5;
    const width = ctx.createGain();
    width.gain.value = 1;
    const invert = ctx.createGain();
    invert.gain.value = -1;
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    const output = ctx.createGain();
    input.connect(split);
    split.connect(midL, 0);
    split.connect(sideL, 0);
    split.connect(midR, 1);
    split.connect(sideR, 1);
    midL.connect(mid);
    midR.connect(mid);
    sideL.connect(side);
    sideR.connect(side);
    mid.connect(outL);
    mid.connect(outR);
    side.connect(width);
    width.connect(outL);
    width.connect(invert);
    invert.connect(outR);
    outL.connect(merge, 0, 0);
    outR.connect(merge, 0, 1);
    merge.connect(output);
    this.hearIn = input;
    this.hearOut = output;
    this.widthGain = width;
    this.outL = outL;
    this.outR = outR;
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;
    if (!this.ctx || !this.master || !this.running) {
      this.onNotice?.("Press play, then record. The file is whatever the ear hears.");
      return;
    }
    this.recordRate = this.ctx.sampleRate;
    this.openSpatial();
    const channels = Math.max(2, this.spatialIds.length * 2);
    const source = this.spatialMerger;
    if (!source) {
      this.onNotice?.("Press play, then record.");
      return;
    }
    try {
      await this.ensureWorklet(source, channels);
      this.recordBuffers = Array.from({ length: channels }, () => []);
      this.recordLeft = [];
      this.recordRight = [];
      this.recordSamples = 0;
      this.recordMode = "wav";
      this.recording = true;
      const count = this.spatialIds.length;
      this.onNotice?.(
        count > 1
          ? `Live sound is the selected ear, in stereo. The download keeps ${count} ears — left and right each, including height.`
          : "Live sound is stereo. The download keeps this ear’s left and right, including height.",
      );
    } catch {
      this.startMediaRecording();
    }
  }

  stopRecording(): void {
    if (!this.recording && this.recordSamples === 0 && this.mediaRecorder?.state !== "recording") return;
    if (this.recordMode === "webm" && this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.recording = false;
      this.mediaRecorder.stop();
      return;
    }
    this.flushRecording();
  }

  private async ensureWorklet(source: AudioNode, channels: number): Promise<void> {
    if (!this.ctx || !this.master) return;
    if (this.recordNode && this.recordNode.channelCount !== channels) {
      try {
        this.recordNode.disconnect();
      } catch {
        /* already free */
      }
      this.recordNode = null;
    }
    if (!this.recordNode) {
      await this.ctx.audioWorklet.addModule("/record-worklet.js");
      const node = new AudioWorkletNode(this.ctx, "lumen-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [channels],
        channelCount: channels,
      });
      node.channelCount = channels;
      node.channelCountMode = "explicit";
      node.channelInterpretation = "discrete";
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      node.port.onmessage = (event: MessageEvent<{ left: Float32Array; right: Float32Array; channels?: Float32Array[] }>) => {
        if (!this.recording || this.recordMode !== "wav") return;
        const incoming = event.data.channels?.length ? event.data.channels : [event.data.left, event.data.right];
        if (this.recordBuffers.length !== incoming.length) this.recordBuffers = incoming.map(() => []);
        incoming.forEach((channel, index) => this.recordBuffers[index]?.push(channel));
        this.recordSamples += incoming[0]?.length ?? 0;
        if (this.recordSamples >= this.recordRate * 60 * 12) {
          this.flushRecording("Recording stopped at twelve minutes.");
        }
      };
      node.connect(sink);
      sink.connect(this.ctx.destination);
      this.recordNode = node;
      this.recordSink = sink;
    }
    try {
      source.disconnect(this.recordNode);
    } catch {
      /* not connected yet */
    }
    source.connect(this.recordNode);
  }

  private startMediaRecording(): void {
    if (!this.ctx || !this.master) return;
    if (!this.mediaDest) {
      this.mediaDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.mediaDest);
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const recorder = new MediaRecorder(this.mediaDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined);
    this.mediaChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.mediaChunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(this.mediaChunks, { type: recorder.mimeType || "audio/webm" });
      this.mediaChunks = [];
      this.recordMode = null;
      if (blob.size < 32) {
        this.onNotice?.("Recording was too short to keep.");
        return;
      }
      this.onRecorded?.(blob, "webm");
    };
    recorder.start();
    this.mediaRecorder = recorder;
    this.recordMode = "webm";
    this.recording = true;
    this.onNotice?.("This browser could only save the live stereo mix. A spatial download needs the recorder, which did not start.");
  }

  private flushRecording(reason?: string): void {
    const was = this.recording || this.recordSamples > 0;
    this.recording = false;
    this.recordMode = null;
    if (!was) return;
    const channels = this.recordBuffers.length
      ? this.recordBuffers.map((chunks) => concatFloats(chunks))
      : [concatFloats(this.recordLeft), concatFloats(this.recordRight)];
    this.recordBuffers = [];
    this.recordLeft = [];
    this.recordRight = [];
    this.recordSamples = 0;
    this.dropSpatial();
    if (!channels[0] || channels[0].length < 32) {
      this.onNotice?.("Recording was too short to keep.");
      return;
    }
    if (reason) this.onNotice?.(reason);
    this.onRecorded?.(encodeWavChannels(channels, this.recordRate), "wav");
  }

  private openSpatial(): void {
    if (!this.ctx || this.ears.length < 1) return;
    const ids = this.ears.map((ear) => ear.id);
    const key = ids.join("|");
    if (this.recording && this.spatialMerger && this.spatialIds.length === ids.length && ids.every((id) => this.spatialIds.includes(id))) {
      this.seedTaps();
      return;
    }
    if (this.spatialMerger && this.spatialKey === key) {
      this.seedTaps();
      return;
    }
    this.dropSpatial();
    this.spatialIds = ids;
    const merger = this.ctx.createChannelMerger(ids.length * 2);
    this.spatialMerger = merger;
    this.spatialKey = key;
    for (const voice of this.voices.values()) this.armVoice(voice);
    this.seedTaps();
  }

  private dropSpatial(): void {
    for (const voice of this.voices.values()) this.disarm(voice);
    try {
      this.spatialMerger?.disconnect();
    } catch {
      /* already free */
    }
    this.spatialMerger = null;
    this.spatialKey = "";
    this.spatialIds = [];
  }

  private armVoice(voice: Voice): void {
    if (!this.ctx || !this.spatialMerger || voice.taps || this.spatialIds.length === 0) return;
    const taps = this.spatialIds.map((earId, index) => {
      const delayL = this.ctx!.createDelay(0.2);
      const delayR = this.ctx!.createDelay(0.2);
      const lowL = this.ctx!.createBiquadFilter();
      const lowR = this.ctx!.createBiquadFilter();
      lowL.type = "lowpass";
      lowR.type = "lowpass";
      lowL.frequency.value = 12000;
      lowR.frequency.value = 12000;
      const gainL = this.ctx!.createGain();
      const gainR = this.ctx!.createGain();
      gainL.gain.value = 0;
      gainR.gain.value = 0;
      voice.air.connect(delayL);
      voice.air.connect(delayR);
      delayL.connect(lowL);
      delayR.connect(lowR);
      lowL.connect(gainL);
      lowR.connect(gainR);
      gainL.connect(this.spatialMerger!, 0, index * 2);
      gainR.connect(this.spatialMerger!, 0, index * 2 + 1);
      return { earId, delayL, delayR, lowL, lowR, gainL, gainR };
    });
    voice.taps = taps;
  }

  private disarm(voice: Voice): void {
    if (!voice.taps) return;
    for (const tap of voice.taps) {
      try {
        voice.air.disconnect(tap.delayL);
        voice.air.disconnect(tap.delayR);
      } catch {
        /* already free */
      }
      tap.delayL.disconnect();
      tap.delayR.disconnect();
      tap.lowL.disconnect();
      tap.lowR.disconnect();
      tap.gainL.disconnect();
      tap.gainR.disconnect();
    }
    voice.taps = undefined;
  }

  private placeTaps(voice: Voice, placed: { x: number; y: number; z: number }, frequency = 220): void {
    if (!voice.taps) return;
    const settings = this.latest?.settings ?? DEFAULT_SETTINGS;
    const norm = 0.28 / Math.sqrt(Math.max(1, this.voices.size));
    for (const tap of voice.taps) {
      const ear = this.ears.find((item) => item.id === tap.earId);
      if (!ear || !this.ctx) continue;
      const left = hornMouth(ear, ear.left, settings);
      const right = hornMouth(ear, ear.right, settings);
      const gotL = gatherCone(placed, left, hornYaw(ear, ear.left, settings), hornPitch(ear, ear.left), ear.left.size, ear.left.gain, settings, domeCeilings(placed, frequency, this.domes, settings));
      const gotR = gatherCone(placed, right, hornYaw(ear, ear.right, settings), hornPitch(ear, ear.right), ear.right.size, ear.right.gain, settings, domeCeilings(placed, frequency, this.domes, settings));
      this.approach(tap.delayL.delayTime, gotL.delay, 0.08);
      this.approach(tap.lowL.frequency, gotL.cutoff, 0.08);
      this.approach(tap.gainL.gain, Math.min(1.4, gotL.level * norm * 4.2), 0.08);
      this.approach(tap.delayR.delayTime, gotR.delay, 0.08);
      this.approach(tap.lowR.frequency, gotR.cutoff, 0.08);
      this.approach(tap.gainR.gain, Math.min(1.4, gotR.level * norm * 4.2), 0.08);
    }
  }

  private seedTaps(): void {
    const settings = this.latest?.settings;
    const bowls = this.latest?.bowls;
    if (!settings || !bowls) return;
    for (const bowl of bowls) {
      const voice = this.voices.get(bowl.id);
      if (!voice?.taps) continue;
      const placed = bowlPoint(
        { x: bowl.x, y: bowl.y, size: bowl.size, height: bowl.height, gain: bowl.gain },
        settings,
      );
      this.placeTaps(voice, placed);
    }
  }

  private approach(param: AudioParam, value: number, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    try {
      param.setValueAtTime(param.value, t);
    } catch {
      /* a value may already sit on this sample */
    }
    param.setTargetAtTime(value, t, seconds);
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export const bathEngine = new BathEngine();
