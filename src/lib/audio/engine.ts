import { GLASS } from "@/lib/audio/glass";
import { bowlPoint, DEFAULT_RECEIVER, receiverPoint } from "@/lib/audio/space";
import type { Bowl, LoopMode, OutputMode, Receiver, Settings } from "@/lib/audio/types";
import { concatFloats, encodeWav } from "@/lib/audio/wav";

const MAX_PARTIALS = 4;

type Voice = {
  id: string;
  mix: GainNode;
  level: GainNode;
  singGain: GainNode;
  phraseGain: GainNode;
  panner: PannerNode;
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
};

function makeIr(ctx: AudioContext, size: number): AudioBuffer {
  const seconds = 1.15 + size * 3.1;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, len, rate);
  const damp = 5.4 - size * 3.5;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    const pole = 0.06 + size * 0.1;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t * damp);
      const white = Math.random() * 2 - 1;
      low += (white - low) * pole;
      data[i] = low * env;
    }
    const taps = [0.013, 0.021, 0.034, 0.049, 0.071];
    taps.forEach((tap, index) => {
      const i = Math.floor(tap * (0.65 + size * 0.8) * rate);
      if (i > 0 && i < len) data[i] += (index % 2 === 0 ? 0.32 : 0.24) * (channel === 0 ? 1 : 0.86);
    });
  }
  let peak = 0.0001;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = 0.32 / peak;
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
  private hallQuant = -1;
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
  private latest: { bowls: Bowl[]; settings: Settings; label: string; receiver: Receiver } | null = null;
  private receiver: Receiver = { ...DEFAULT_RECEIVER };
  private listenerAt = { x: 0, y: 1.3, z: 2 };
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

  isRecording(): boolean {
    return this.recording;
  }

  remember(bowls: Bowl[], settings: Settings, label: string, receiver: Receiver = this.receiver): void {
    this.latest = { bowls, settings, label, receiver };
    this.receiver = receiver;
    this.label = label;
    if (this.running) this.publishSession();
  }

  startFromGesture(
    bowls: Bowl[],
    settings: Settings,
    label: string,
    receiver: Receiver = this.receiver,
  ): Promise<void> {
    try {
      this.life += 1;
      if (!this.ctx) this.createGraph();
      const ctx = this.ctx!;
      const pending = ctx.resume();
      this.running = true;
      this.volume = settings.volume;
      this.label = label;
      this.receiver = receiver;
      this.latest = { bowls, settings, label, receiver };
      this.hookOutput(settings.output);
      this.hookMediaSession();
      this.publishSession();
      const now = ctx.currentTime;
      this.master!.gain.cancelScheduledValues(now);
      this.master!.gain.setValueAtTime(0.0001, now);
      this.master!.gain.linearRampToValueAtTime(Math.max(0.0001, settings.volume), now + 0.08);
      this.sync(bowls, settings, label, receiver);
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

  sync(bowls: Bowl[], settings: Settings, label: string, receiver: Receiver = this.receiver): void {
    if (!this.running || !this.ctx || !this.master || !this.wet || !this.air) return;
    this.label = label;
    this.receiver = receiver;
    this.latest = { bowls, settings, label, receiver };
    this.volume = settings.volume;
    if (!this.dipping) this.approach(this.master.gain, Math.max(0.0001, settings.volume), 0.06);
    this.updateHall(settings.hall);
    this.approach(this.wet.gain, Math.max(0, Math.min(0.8, settings.wet)), 0.08);
    this.approach(this.air.gain, -7.5 * settings.air, 0.08);
    if (settings.output !== this.output && !(settings.output === "session" && this.sessionBlocked)) {
      this.hookOutput(settings.output);
    }
    this.placeListener(settings, receiver);
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
    bus.connect(dry);
    bus.connect(predelay);
    predelay.connect(convolver);
    convolver.connect(wetHigh);
    wetHigh.connect(wet);
    dry.connect(hpf);
    wet.connect(hpf);
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
    this.timeBuf = new Uint8Array(analyser.fftSize);
    this.stream = ctx.createMediaStreamDestination();
    const el = new Audio();
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.preload = "none";
    el.dataset.lumen = "session";
    el.srcObject = this.stream.stream;
    document.body.appendChild(el);
    this.el = el;
    this.updateHall(0.4);
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
    // Always the speakers. A media-element-only path stays silent inside the preview frame.
    this.analyser.connect(this.ctx.destination);
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
    this.analyser.connect(this.ctx.destination);
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
          this.startFromGesture(this.latest.bowls, this.latest.settings, this.latest.label, this.latest.receiver);
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

  private updateHall(size: number): void {
    if (!this.ctx || !this.convolver) return;
    const quant = Math.round(size * 16);
    if (quant === this.hallQuant && this.convolver.buffer) return;
    this.hallQuant = quant;
    this.convolver.buffer = makeIr(this.ctx, size);
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
    const panner = ctx.createPanner();
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
    phraseGain.connect(panner);
    panner.connect(this.bus!);
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
      panner,
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
    const placed = bowlPoint({ x: bowl.x, y: bowl.y, size: width, height }, settings);
    this.approach(voice.panner.positionX, placed.x, 0.025);
    this.approach(voice.panner.positionY, placed.y, 0.025);
    this.approach(voice.panner.positionZ, placed.z, 0.025);
    voice.panner.refDistance = 0.75 + width * 1.55;
    voice.panner.rolloffFactor = Math.max(0.3, 1.1 - width * 0.58);
  }

  private releaseVoice(voice: Voice): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.approach(voice.level.gain, 0, 0.03);
    const stopAt = now + 0.16;
    this.stopVoiceNodes(voice, stopAt);
    this.voices.delete(voice.id);
    window.setTimeout(() => {
      try {
        voice.mix.disconnect();
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
    const when = this.ctx ? this.ctx.currentTime + 0.02 : 0;
    for (const voice of this.voices.values()) this.stopVoiceNodes(voice, when);
    this.voices.clear();
    this.envMode = null;
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

  private placeListener(settings: Settings, receiver: Receiver): void {
    if (!this.ctx) return;
    const placed = receiverPoint(receiver, settings);
    this.listenerAt = placed;
    const listener = this.ctx.listener;
    if (!listener.positionX) return;
    this.approach(listener.positionX, placed.x, 0.02);
    this.approach(listener.positionY, placed.y, 0.02);
    this.approach(listener.positionZ, placed.z, 0.02);
    const mag = Math.hypot(placed.x, placed.z);
    const forwardX = mag < 0.001 ? 0 : -placed.x / mag;
    const forwardZ = mag < 0.001 ? -1 : -placed.z / mag;
    this.approach(listener.forwardX, forwardX, 0.04);
    this.approach(listener.forwardY, 0, 0.04);
    this.approach(listener.forwardZ, forwardZ, 0.04);
    this.approach(listener.upX, 0, 0.04);
    this.approach(listener.upY, 1, 0.04);
    this.approach(listener.upZ, 0, 0.04);
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;
    if (!this.ctx || !this.master || !this.running) {
      this.onNotice?.("Press play, then record. The file is whatever the ear hears.");
      return;
    }
    this.recordRate = this.ctx.sampleRate;
    try {
      await this.ensureWorklet();
      this.recordLeft = [];
      this.recordRight = [];
      this.recordSamples = 0;
      this.recordMode = "wav";
      this.recording = true;
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

  private async ensureWorklet(): Promise<void> {
    if (!this.ctx || !this.master || this.recordNode) return;
    await this.ctx.audioWorklet.addModule("/record-worklet.js");
    const node = new AudioWorkletNode(this.ctx, "lumen-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
    });
    node.channelCountMode = "explicit";
    node.channelInterpretation = "speakers";
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    node.port.onmessage = (event: MessageEvent<{ left: Float32Array; right: Float32Array }>) => {
      if (!this.recording || this.recordMode !== "wav") return;
      const left = event.data.left;
      const right = event.data.right;
      this.recordLeft.push(left);
      this.recordRight.push(right);
      this.recordSamples += left.length;
      if (this.recordSamples >= this.recordRate * 60 * 12) {
        this.flushRecording("Recording stopped at twelve minutes.");
      }
    };
    this.master.connect(node);
    node.connect(sink);
    sink.connect(this.ctx.destination);
    this.recordNode = node;
    this.recordSink = sink;
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
  }

  private flushRecording(reason?: string): void {
    const was = this.recording || this.recordSamples > 0;
    this.recording = false;
    this.recordMode = null;
    if (!was) return;
    const left = concatFloats(this.recordLeft);
    const right = concatFloats(this.recordRight);
    this.recordLeft = [];
    this.recordRight = [];
    this.recordSamples = 0;
    if (left.length < 32) {
      this.onNotice?.("Recording was too short to keep.");
      return;
    }
    if (reason) this.onNotice?.(reason);
    this.onRecorded?.(encodeWav(left, right, this.recordRate), "wav");
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
