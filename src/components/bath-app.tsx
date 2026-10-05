import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Cast, ChevronUp, Circle, Library, Pause, Play, Settings, Volume2, X } from "lucide-react";
import { nudgeView, setChamberIdle, setKioskPhase } from "@/components/chamber";
import { CastDialog } from "@/components/cast-dialog";
import { CastLink } from "@/components/cast-link";
import { CastPad } from "@/components/cast-pad";
import { DashboardDialog } from "@/components/dashboard";
import { PresetDialog } from "@/components/dialogs";
import { FanDialog } from "@/components/fan-dialog";
import { GUIDE, useGuide } from "@/components/guide";
import { AccountLink, SavedTracksDialog } from "@/components/saved-tracks";
import { notePlay } from "@/lib/community/play";
import { notePresetPlay } from "@/lib/community/preset-stats";
import { browseTemplates, getTemplate } from "@/lib/community/api";
import { keepLibrary } from "@/lib/community/archive-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PRESETS } from "@/lib/audio/presets";
import type { ShareView } from "@/lib/share/types";
import { Inspector } from "@/components/inspector";
import { SessionPanel } from "@/components/session-panel";
import { applySceneView } from "@/lib/share/scene";
import { ViewportShare } from "@/components/share-sheet";
import { FeedbackDock } from "@/components/feedback";
import { PresetSwitcher } from "@/components/preset-switcher";
import { Stage } from "@/components/stage";
import { projectChamber } from "@/components/chamber";
import { bathEngine } from "@/lib/audio/engine";
import { GLASS } from "@/lib/audio/glass";
import { describePitch, shortNote } from "@/lib/audio/notes";
import { bindBathPersistence, redoBath, soundscapeTitle, undoBath, useBath } from "@/stores/bath";
import { castBus } from "@/lib/cast/protocol";
import { useCast } from "@/lib/cast/session";

function pickPreset() {
  return PRESETS[Math.floor(Math.random() * PRESETS.length)]?.id ?? null;
}

/** First visit only: a preset or a fan bath, with an even chance of either. */
async function openAtRandom(stamp: number, presetId: string | null) {
  const untouched = () => {
    const state = useBath.getState();
    return !state.changed && state.loadStamp === stamp && state.presetId === presetId;
  };
  const openPreset = () => {
    const id = pickPreset();
    if (!id || !untouched()) return;
    useBath.getState().applyPreset(id, { history: false });
  };
  if (Math.random() < 0.5) {
    openPreset();
    return;
  }
  const cards = await browseTemplates({ data: { sort: "new" } }).catch(() => []);
  const fans = cards.filter((card) => card.kind === "track");
  if (!untouched()) return;
  if (fans.length === 0) {
    openPreset();
    return;
  }
  const card = fans[Math.floor(Math.random() * fans.length)];
  const template = card ? await getTemplate({ data: card.id }).catch(() => null) : null;
  if (!untouched()) return;
  if (!template) {
    openPreset();
    return;
  }
  useBath.getState().loadPublished(template);
  useBath.setState({ notice: null });
}

function adoptArrival(setWaves: (open: boolean) => void) {
  const settings = useBath.getState().settings;
  const use = settings.use;
  if (use) {
    useBath.getState().setCycle({ on: Boolean(use.cycle), seconds: use.cycleSeconds });
    if (use.waves) setWaves(true);
    if (use.playing) {
      const start = () => {
        window.removeEventListener("pointerdown", start);
        const state = useBath.getState();
        if (state.playing || bathEngine.isRunning()) return;
        void bathEngine.startFromGesture(state.bowls, state.settings, soundscapeTitle(state), state.receiver, state.ears, state.activeEarId, state.domes);
        useBath.getState().setPlaying(true);
      };
      window.addEventListener("pointerdown", start, { once: true });
    }
  }
  if (settings.view) applySceneView(settings.view);
}

export function BathApp({
  templateId,
  startDash = false,
  castCode,
  share = null,
}: {
  templateId?: string;
  startDash?: boolean;
  castCode?: string;
  share?: ShareView | null;
}) {
  const bowls = useBath((state) => state.bowls);
  const settings = useBath((state) => state.settings);
  const playing = useBath((state) => state.playing);
  const presetId = useBath((state) => state.presetId);
  const activeName = useBath((state) => state.activeName);
  const selectedId = useBath((state) => state.selectedId);
  const notice = useBath((state) => state.notice);
  const receiver = useBath((state) => state.receiver);
  const ears = useBath((state) => state.ears);
  const domes = useBath((state) => state.domes);
  const activeEarId = useBath((state) => state.activeEarId);
  const previewEarId = useBath((state) => state.previewEarId);
  const focus = useBath((state) => state.focus);
  const hydrated = useBath((state) => state.hydrated);
  const hydrate = useBath((state) => state.hydrate);
  const { user } = useCurrentUserState();
  const setSettings = useBath((state) => state.setSettings);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(startDash);
  useEffect(() => {
    if (startDash) setDashOpen(true);
  }, [startDash]);
  useEffect(() => {
    if (castCode) useCast.getState().adoptUrl(castCode);
  }, [castCode]);
  const [resting, setResting] = useState(false);
  const [panel, setPanel] = useState<"hidden" | "session" | "item">("hidden");
  const [tucked, setTucked] = useState(false);
  const [waves, setWaves] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [recording, setRecording] = useState(false);
  const heldRef = useRef(false);
  const [pulse, setPulse] = useState(false);
  const castOpen = useCast((state) => state.open);
  const castRoom = useCast((state) => state.room);
  const castCodeLive = useCast((state) => state.code);
  const castHost = useCast((state) => state.host);
  const castRole = useCast((state) => state.role);
  const castPeers = useCast((state) => state.peers);
  const cycleThrough = useBath((state) => state.cycleThrough);
  const cycleSeconds = useBath((state) => state.cycleSeconds);
  const earCount = ears.length;
  useEffect(() => {
    bathEngine.setCycleStep(cycleThrough && earCount >= 2 ? cycleSeconds : null);
    if (!cycleThrough || earCount < 2) return;
    const timer = window.setInterval(() => {
      if (castBus.role === "display") return;
      useBath.getState().cycleEars();
    }, cycleSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [cycleThrough, cycleSeconds, earCount]);
  useEffect(() => {
    if (castRole) useCast.getState().setOpen(false);
  }, [castRole]);

  useLayoutEffect(() => {
    if (castRole !== "display") return;
    setResting(true);
    setChamberIdle(true);
  }, [castRole]);
  const dashRef = useRef(dashOpen);
  const presetsRef = useRef(presetsOpen);
  const libraryRef = useRef(libraryOpen);
  dashRef.current = dashOpen;
  presetsRef.current = presetsOpen;
  libraryRef.current = libraryOpen;
  const guideOpen = useGuide((state) => state.open);
  const guideStep = useGuide((state) => state.step);

  useEffect(() => {
    if (guideOpen) {
      setTucked(false);
      return;
    }
    if (resting || castRole === "display") setTucked(true);
  }, [resting, castRole, guideOpen]);

  const title = soundscapeTitle({ activeName, presetId });
  const changed = useBath((state) => state.changed);
  const selected = bowls.find((bowl) => bowl.id === selectedId) ?? bowls[0];
  const veil = resting ? "pointer-events-none opacity-0 transition-opacity duration-1000" : "opacity-100 transition-opacity duration-700";

  async function begin() {
    const state = useBath.getState();
    await bathEngine.startFromGesture(
      state.bowls,
      state.settings,
      soundscapeTitle(state),
      state.receiver,
      state.ears,
      state.activeEarId,
      state.domes,
    );
    const audible = bathEngine.isRunning() && bathEngine.contextState() === "running";
    if (audible) {
      heldRef.current = false;
      setPulse(false);
    }
    useBath.getState().setPlaying(audible);
    if (audible) {
      const next = useBath.getState();
      notePlay(next.sourceTemplateId);
      notePresetPlay(next.presetId ?? next.originPresetId);
    }
    return audible;
  }

  function pause() {
    heldRef.current = true;
    setPulse(false);
    bathEngine.stop();
    useBath.getState().setPlaying(false);
  }

  useEffect(() => {
    const restored = hydrate();
    const unbind = bindBathPersistence();
    if (!restored && !templateId && !share) {
      const state = useBath.getState();
      void openAtRandom(state.loadStamp, state.presetId);
    }
    bathEngine.onTransport = (next) => {
      const state = useBath.getState();
      if (next && !bathEngine.isRunning()) {
        bathEngine.startFromGesture(state.bowls, state.settings, soundscapeTitle(state), state.receiver, state.ears, state.activeEarId, state.domes);
      }
      if (!next && bathEngine.isRunning()) bathEngine.stop();
      if (!next) {
        heldRef.current = true;
        setPulse(false);
      } else {
        heldRef.current = false;
        setPulse(false);
      }
      useBath.setState({ playing: next });
    };
    bathEngine.onNotice = (message) => {
      if (castBus.role === "display") return;
      useBath.getState().setNotice(message);
    };
    bathEngine.onOutput = (output) => useBath.getState().setSettings({ output });
    const debug = window as Window & {
      __lumen?: {
        status: () => string;
        voices: () => number;
        energy: () => number;
        fundHz: (id?: string) => number | null;
        context: () => string;
        listener: () => { x: number; y: number; z: number };
        forward: () => { x: number; y: number; z: number };
        project: () => ReturnType<typeof projectChamber>;
        recording: () => boolean;
        undo: () => boolean;
        redo: () => boolean;
      };
    };
    debug.__lumen = {
      status: () => bathEngine.status(),
      voices: () => bathEngine.voiceCount(),
      energy: () => bathEngine.readEnergy(),
      fundHz: (id?: string) => bathEngine.fundHz(id),
      context: () => bathEngine.contextState(),
      listener: () => bathEngine.listenerNow(),
      forward: () => bathEngine.forwardNow(),
      project: () => projectChamber(),
      recording: () => bathEngine.isRecording(),
      undo: () => undoBath(),
      redo: () => redoBath(),
    };
    bathEngine.onRecorded = (blob, ext) => {
      const slug = soundscapeTitle(useBath.getState())
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug || "lumen-bath"}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setRecording(false);
      if (castBus.role === "display") return;
      useBath.getState().setNotice(
        ext === "wav"
          ? "Saved a spatial file. Each ear is its own left and right, including height."
          : "Saved the live stereo mix. This browser could not write the spatial file.",
      );
    };
    const kick = () => begin();
    const timer = window.setTimeout(kick, 60);
    return () => {
      window.clearTimeout(timer);
      unbind();
      bathEngine.onTransport = null;
      bathEngine.onNotice = null;
      bathEngine.onOutput = null;
      bathEngine.onRecorded = null;
      bathEngine.stop();
    };
  }, [hydrate]);

  useEffect(() => {
    if (!user || castRole === "display") return;
    let armed = false;
    let timer = 0;
    let lastSession = "";
    let lastLibrary = "";
    const send = () => {
      const state = useBath.getState();
      if (!state.hydrated) return;
      const session = JSON.stringify({
        settings: state.settings,
        bowls: state.bowls,
        ears: state.ears,
        domes: state.domes,
        receiver: state.receiver,
        activeName: state.activeName,
        presetId: state.presetId,
      });
      const library = JSON.stringify(state.library);
      if (session === lastSession && library === lastLibrary) return;
      const includeLibrary = library !== lastLibrary;
      lastSession = session;
      lastLibrary = library;
      void keepLibrary({
        data: {
          settings: state.settings,
          bowls: state.bowls,
          ears: state.ears,
          domes: state.domes,
          receiver: state.receiver,
          activeName: state.activeName,
          presetId: state.presetId,
          ...(includeLibrary ? { library: state.library } : {}),
        },
      }).catch(() => undefined);
    };
    const arm = () => {
      armed = true;
    };
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    const unbind = useBath.subscribe(() => {
      if (!armed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(send, 8000);
    });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      unbind();
      window.clearTimeout(timer);
    };
  }, [user, castRole]);

  useEffect(() => {
    if (!hydrated || !templateId) return;
    let cancel = false;
    getTemplate({ data: templateId })
      .then((template) => {
        if (cancel) return;
        if (!template) {
          useBath.getState().setNotice("That shared bath is gone.");
          return;
        }
        useBath.getState().loadPublished(template);
        adoptArrival(setWaves);
        if (useBath.getState().playing) notePlay(template.id);
      })
      .catch(() => {
        if (!cancel) useBath.getState().setNotice("Could not open that shared bath.");
      });
    return () => {
      cancel = true;
    };
  }, [hydrated, templateId]);

  useEffect(() => {
    if (!hydrated || !share) return;
    useBath.getState().loadPublished({
      id: share.id ?? share.slug,
      title: share.title,
      description: share.description,
      plays: 0,
      shares: 0,
      kind: "track",
      day: null,
      parentId: null,
      parentTitle: null,
      author: share.author,
      createdAt: "",
      settings: share.settings,
      receiver: share.receiver,
      bowls: share.bowls,
      ears: share.ears,
      userSlug: share.userSlug,
      slug: share.slug,
    });
    adoptArrival(setWaves);
    if (share.presetId) {
      useBath.setState({
        presetId: share.presetId,
        originPresetId: share.presetId,
        sourceTemplateId: null,
        shareRef: null,
        activeName: share.title,
      });
    }
  }, [hydrated, share]);

  useEffect(() => {
    const label = soundscapeTitle({ activeName, presetId });
    bathEngine.hearPreview(previewEarId);
    bathEngine.remember(bowls, settings, label, receiver, ears, activeEarId, domes);
    if (playing && bathEngine.isRunning()) bathEngine.sync(bowls, settings, label, receiver, ears, activeEarId, domes);
  }, [bowls, settings, playing, activeName, presetId, receiver, ears, activeEarId, previewEarId, domes]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => useBath.getState().setNotice(null), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!guideOpen) return;
    const step = GUIDE[guideStep];
    if (!step) return;
    if (step.panel) setPanel(step.panel);
    setTucked(false);
    if (step.waves) setWaves(true);
    if (step.focus === "bowl") {
      const id = useBath.getState().selectedId ?? useBath.getState().bowls[0]?.id;
      if (id) useBath.getState().select(id);
    }
    if (step.focus === "dome") {
      const id = useBath.getState().domes[0]?.id;
      if (id) useBath.getState().selectDome(id);
    }
    if (step.focus === "ear") {
      const ear = useBath.getState().ears[0];
      if (ear) useBath.getState().selectEar(ear.id);
    }
    setSheet(true);
  }, [guideOpen, guideStep]);

  useEffect(() => {
    if (!settings.awake) return;
    if (!("wakeLock" in navigator)) {
      useBath.getState().setSettings({ awake: false });
      useBath.getState().setNotice("This browser did not keep the screen awake.");
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancel = false;
    void navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (cancel) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => {
        if (cancel) return;
        useBath.getState().setSettings({ awake: false });
        useBath.getState().setNotice("This browser did not keep the screen awake.");
      });
    return () => {
      cancel = true;
      void lock?.release();
    };
  }, [settings.awake]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-transport]")) return;
      if (heldRef.current) {
        setPulse(true);
        return;
      }
      if (bathEngine.isRunning() && bathEngine.contextState() === "running") return;
      begin();
    }
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, []);

  useEffect(() => {
    let listenTimer = 0;
    let bowlTimer = 0;
    let waveTimer = 0;
    const arm = () => {
      listenTimer = window.setTimeout(() => {
        setResting(true);
        setChamberIdle(true);
      }, 5500);
      bowlTimer = window.setTimeout(() => setKioskPhase("bowls"), 3 * 60 * 1000);
      waveTimer = window.setTimeout(() => setKioskPhase("waves"), 13 * 60 * 1000);
    };
    const wake = () => {
      window.clearTimeout(listenTimer);
      window.clearTimeout(bowlTimer);
      window.clearTimeout(waveTimer);
      setResting(false);
      setChamberIdle(false);
      arm();
    };
    arm();
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("pointermove", wake, true);
    window.addEventListener("keydown", wake);
    window.addEventListener("wheel", wake, { capture: true, passive: true });
    return () => {
      window.clearTimeout(listenTimer);
      window.clearTimeout(bowlTimer);
      window.clearTimeout(waveTimer);
      setChamberIdle(false);
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("pointermove", wake, true);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake, true);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (heldRef.current && !useBath.getState().playing) setPulse(true);
        if (castBus.role === "display") {
          event.preventDefault();
          castBus.send?.({ kind: "bye" });
          useCast.getState().stop();
          return;
        }
        if (dashRef.current) {
          event.preventDefault();
          setDashOpen(false);
          return;
        }
        if (presetsRef.current) {
          setPresetsOpen(false);
          return;
        }
        if (libraryRef.current) {
          setLibraryOpen(false);
          return;
        }
        if (useBath.getState().handoff) {
          event.preventDefault();
          useBath.getState().makeStem();
          return;
        }
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.code === "Space" || event.key === " ") {
        if (typing || event.repeat) return;
        event.preventDefault();
        if (useBath.getState().playing) pause();
        else begin();
        return;
      }
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoBath();
        else undoBath();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoBath();
        return;
      }
      if (event.code === "KeyQ" || event.code === "KeyE") {
        event.preventDefault();
        const step = event.code === "KeyQ" ? -0.12 : 0.12;
        const yaw = useBath.getState().receiver.yaw;
        useBath.getState().turnReceiver(yaw + step);
        nudgeView(step);
      }
      if (event.key.startsWith("Arrow")) {
        const state = useBath.getState();
        const step = event.shiftKey ? 0.04 : 0.015;
        event.preventDefault();
        if (event.key === "ArrowLeft") state.nudgeSelection(-step, 0);
        if (event.key === "ArrowRight") state.nudgeSelection(step, 0);
        if (event.key === "ArrowUp") state.nudgeSelection(0, -step);
        if (event.key === "ArrowDown") state.nudgeSelection(0, step);
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const state = useBath.getState();
        if (state.focus === "ear") state.removeEar(state.activeEarId);
        else if (state.focus === "dome" && state.selectedId) state.removeDome(state.selectedId);
        else if (state.selectedId) state.removeBowl(state.selectedId);
      }
      if (heldRef.current && !useBath.getState().playing) setPulse(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function togglePlay() {
    if (useBath.getState().playing) pause();
    else begin();
  }

  async function toggleRecord() {
    if (bathEngine.isRecording()) {
      bathEngine.stopRecording();
      if (castBus.role === "control") castBus.send?.({ kind: "record", on: false });
      return;
    }
    if (!bathEngine.isRunning() || bathEngine.contextState() !== "running") {
      const ok = await begin();
      if (!ok) return;
    }
    await bathEngine.startRecording();
    setRecording(bathEngine.isRecording());
    if (castBus.role === "control") castBus.send?.({ kind: "record", on: true });
  }

  const pitch = selected ? describePitch(selected.frequency) : null;
  const stage = castRole === "display";
  const castLinked = useCast((state) => state.linked);
  const castPaired = castPeers.some((peer) => peer.connectionState === "connected") || castLinked;
  const castFailed = !castPaired && castPeers.some((peer) => peer.connectionState === "failed");

  function hostCast() {
    void begin();
    useCast.getState().hostCast();
  }

  function joinCast(raw: string) {
    void begin();
    useCast.getState().join(raw);
  }

  function stopCast() {
    useCast.getState().stop();
  }

  function showSession() {
    setPanel("session");
    setTucked(false);
    setSheet(true);
  }

  function showItem() {
    setPanel("item");
    setTucked(false);
    if (window.matchMedia("(min-width: 1024px)").matches) setSheet(true);
  }

  function openItemSettings() {
    setPanel("item");
    setTucked(false);
    setSheet(true);
  }

  function hidePanel() {
    setPanel("hidden");
    setSheet(false);
  }

  const earIndex = ears.findIndex((item) => item.id === activeEarId);
  const dome = domes.find((item) => item.id === selectedId);
  const sheetTitle =
    panel === "session"
      ? "Session"
      : focus === "ear"
        ? earIndex <= 0
          ? "Ear 1 · what you hear"
          : previewEarId === activeEarId
            ? `Stem ${earIndex} · preview`
            : `Stem ${earIndex} · recording`
        : focus === "dome"
          ? dome
            ? `Dome · ${GLASS[dome.glass].label}`
            : "Dome"
          : selected && pitch
          ? `${shortNote(selected.frequency)} · ${pitch.hzLabel} Hz · ${GLASS[selected.glass].label}`
          : "Bowl";

  return (
    <main className="flex h-dvh items-start overflow-hidden bg-bg text-fg" data-cast-role={castRole ?? "off"}>
      {panel !== "hidden" && !stage ? (
        <aside
          className={`hidden h-dvh shrink-0 overflow-hidden lg:block ${tucked ? "w-0 transition-[width] duration-1000" : "w-96 transition-[width] duration-700"}`}
          data-side-panel={panel}
          aria-hidden={tucked}
        >
          <div className={`flex h-full w-96 flex-col border-r border-line bg-surface ${veil}`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
              <h2 className="font-display text-3xl leading-none text-fg">{panel === "session" ? "Session" : "Selected"}</h2>
              <button type="button" className="grid size-11 place-items-center rounded-md text-muted" aria-label="Hide the side menu" onClick={hidePanel}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
              {panel === "session" ? <SessionPanel /> : <Inspector />}
            </div>
          </div>
        </aside>
      ) : null}
      <div className="relative flex h-dvh min-h-0 min-w-0 flex-1 flex-col self-start overflow-hidden">
        {stage ? (
          <button
            type="button"
            className={`absolute top-3 right-3 z-30 grid size-11 place-items-center rounded-full border border-gold bg-surface/80 text-gold ${veil}`}
            onClick={() => useCast.getState().setOpen(true)}
            aria-label="Casting. Open cast controls"
          >
            <Cast className="size-5" />
          </button>
        ) : (
        <>
        <header className={`z-30 flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 ${veil}`}>
          <h1 className="min-w-0 shrink font-display text-xl leading-none text-fg sm:text-2xl">Lumen Bath</h1>
          <button
            type="button"
            data-transport
            className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-gold px-4 text-base font-medium text-bg ${pulse && !playing ? "pause-pulse" : ""}`}
            onClick={togglePlay}
            aria-pressed={playing}
            aria-label={playing ? "Pause the bath" : "Play the bath"}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            data-transport
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-gold px-3 text-sm font-medium text-fg"
            onClick={() => void toggleRecord()}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording the ear" : "Record the ear"}
          >
            <Circle className={`size-3 ${recording ? "fill-red-500 text-red-500" : "fill-transparent"}`} />
            <span className="hidden sm:inline">{recording ? "Stop" : "Record"}</span>
          </button>
          <label className="ml-auto hidden items-center gap-2 md:flex">
            <Volume2 className="size-4 text-muted" aria-hidden="true" />
            <span className="sr-only">Volume</span>
            <input
              className="h-11 w-24"
              type="range"
              min={0}
              max={100}
              aria-description="How loud the bath is."
              value={Math.round(settings.volume * 100)}
              onChange={(event) => setSettings({ volume: Number(event.target.value) / 100 })}
            />
          </label>
          <button
            type="button"
            className="relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-fg"
            onClick={hostCast}
            aria-label="Cast to another screen"
            data-cast-button="open"
          >
            <Cast className="size-5" />
            <span>Cast</span>
            <span className="absolute top-1 right-1 size-2 rounded-full bg-gold" aria-hidden="true" />
            <span className="sr-only">New</span>
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md border border-line text-fg"
            onClick={() => setLibraryOpen(true)}
            aria-label="Saved tracks"
          >
            <Library className="size-5" />
          </button>
          <AccountLink onDash={() => setDashOpen(true)} />
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md border border-line text-fg"
            onClick={showSession}
            aria-label="Room shape and acoustics"
            aria-pressed={panel === "session"}
          >
            <Box className="size-5" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md border border-line text-fg"
            onClick={showSession}
            aria-label="Session settings"
            aria-pressed={panel === "session"}
          >
            <Settings className="size-5" />
          </button>
        </header>
        <div className={`grid grid-cols-2 gap-2 px-3 pb-2 ${veil}`}>
          <button type="button" className="h-11 rounded-md border border-line px-3 text-sm text-fg" onClick={() => setPresetsOpen(true)}>
            Presets
          </button>
          <button type="button" className="h-11 rounded-md border border-line px-3 text-sm text-fg" onClick={() => setFanOpen(true)}>
            Fan Created
          </button>
          {changed ? (
            <button type="button" className="col-span-2 h-11 rounded-md border border-gold px-3 text-sm text-gold" onClick={() => setFanOpen(true)}>
              Save as new
            </button>
          ) : null}
          <p className="col-span-2 truncate text-sm text-muted">{title}</p>
        </div>
        </>
        )}
        {notice && !stage ? (
          <p className={`pointer-events-none absolute top-20 left-1/2 z-30 max-w-sm -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-center text-sm text-fg ${veil}`} role="status">
            {notice}
          </p>
        ) : null}
        <div className="relative min-h-0 flex-1">
          <Stage
            waves={waves}
            onWaves={setWaves}
            quiet={resting || stage}
            present={stage}
            onPick={showItem}
            onSettings={openItemSettings}
            onRoom={() => {
              if (stage) return;
              setPanel((current) => {
                const next = current === "session" ? "hidden" : "session";
                setSheet(next !== "hidden");
                if (next !== "hidden") setTucked(false);
                return next;
              });
            }}
            onClear={hidePanel}
          />
          {castRole === "control" ? <CastPad /> : null}
          {!playing && !stage && !heldRef.current ? (
            <div className={`absolute inset-0 z-30 flex items-center justify-center bg-bg/55 ${veil}`}>
              <button
                type="button"
                data-transport
                className="inline-flex h-16 items-center gap-3 rounded-full bg-gold px-8 text-xl font-medium text-bg shadow-lg"
                onClick={begin}
              >
                <Play className="size-6" />
                Press to play
              </button>
            </div>
          ) : null}
          {!stage ? (
          <div className={`absolute inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:hidden ${veil}`}>
            <button
              type="button"
              className="flex h-14 w-full items-center justify-between gap-3 px-4 text-left"
              onClick={() => {
                setSheet((open) => {
                  const next = !open;
                  if (next) setPanel((current) => (current === "hidden" ? "item" : current));
                  else setPanel("hidden");
                  return next;
                });
              }}
              aria-expanded={sheet}
            >
              <span className="min-w-0 truncate text-sm">{sheetTitle}</span>
              <ChevronUp className={`size-5 shrink-0 text-muted ${sheet ? "rotate-180" : ""}`} />
            </button>
            {sheet ? (
              <div className="max-h-96 overflow-y-auto px-4 pb-4">
                {panel === "session" ? <SessionPanel /> : <Inspector />}
              </div>
            ) : null}
          </div>
          ) : null}
          {stage ? null : <ViewportShare quiet={resting} waves={waves} />}
          {stage ? null : <FeedbackDock quiet={resting} />}
          {stage ? null : <PresetSwitcher quiet={resting} />}
        </div>
      </div>
      <PresetDialog open={presetsOpen} onOpenChange={setPresetsOpen} />
      <FanDialog open={fanOpen} saving={changed} onOpenChange={setFanOpen} />
      <SavedTracksDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onEditProfile={() => {
          setLibraryOpen(false);
          setDashOpen(true);
        }}
      />
      <DashboardDialog open={dashOpen && !stage} onOpenChange={setDashOpen} />
      {castRoom ? (
        <CastLink room={castRoom} host={castHost} waves={waves} onWaves={setWaves} />
      ) : null}
      <CastDialog
        open={castOpen}
        onOpenChange={(next) => useCast.getState().setOpen(next)}
        code={castCodeLive}
        role={castRole}
        paired={castPaired}
        failed={castFailed}
        onJoin={joinCast}
        onStop={stopCast}
      />
      <p className={`pointer-events-none fixed bottom-16 left-3 z-10 text-[11px] leading-none tracking-wide text-muted [text-shadow:0_1px_2px_var(--color-shadow)] lg:right-3 lg:bottom-2 lg:left-auto ${stage ? "hidden" : veil}`}>
        Made with {"<3"} in SF <span aria-hidden="true">|</span>{" "}
        <a
          href="https://maxi.grok.me"
          target="_blank"
          rel="noreferrer"
          className={`${resting ? "pointer-events-none" : "pointer-events-auto"} underline decoration-line underline-offset-2 hover:text-fg`}
        >
          maxi.grok.me
        </a>
      </p>
    </main>
  );
}
