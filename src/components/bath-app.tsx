import { useEffect, useState } from "react";
import { ChevronUp, Library, Pause, Play, Settings, Volume2 } from "lucide-react";
import { LibraryDialog, PresetDialog, SettingsDialog } from "@/components/dialogs";
import { Inspector } from "@/components/inspector";
import { Stage } from "@/components/stage";
import { bathEngine } from "@/lib/audio/engine";
import { GLASS } from "@/lib/audio/glass";
import { describePitch, shortNote } from "@/lib/audio/notes";
import { bindBathPersistence, soundscapeTitle, useBath } from "@/stores/bath";

export function BathApp() {
  const bowls = useBath((state) => state.bowls);
  const settings = useBath((state) => state.settings);
  const playing = useBath((state) => state.playing);
  const presetId = useBath((state) => state.presetId);
  const activeName = useBath((state) => state.activeName);
  const selectedId = useBath((state) => state.selectedId);
  const notice = useBath((state) => state.notice);
  const hydrate = useBath((state) => state.hydrate);
  const setSettings = useBath((state) => state.setSettings);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sheet, setSheet] = useState(false);

  const title = soundscapeTitle({ activeName, presetId });
  const selected = bowls.find((bowl) => bowl.id === selectedId) ?? bowls[0];

  async function begin() {
    const state = useBath.getState();
    await bathEngine.startFromGesture(state.bowls, state.settings, soundscapeTitle(state));
    const audible = bathEngine.isRunning() && bathEngine.contextState() === "running";
    useBath.getState().setPlaying(audible);
    return audible;
  }

  function pause() {
    bathEngine.stop();
    useBath.getState().setPlaying(false);
  }

  useEffect(() => {
    hydrate();
    const unbind = bindBathPersistence();
    bathEngine.onTransport = (next) => {
      const state = useBath.getState();
      if (next && !bathEngine.isRunning()) {
        bathEngine.startFromGesture(state.bowls, state.settings, soundscapeTitle(state));
      }
      if (!next && bathEngine.isRunning()) bathEngine.stop();
      useBath.setState({ playing: next });
    };
    bathEngine.onNotice = (message) => useBath.getState().setNotice(message);
    bathEngine.onOutput = (output) => useBath.getState().setSettings({ output });
    const debug = window as Window & {
      __lumen?: {
        status: () => string;
        voices: () => number;
        energy: () => number;
        fundHz: (id?: string) => number | null;
        context: () => string;
      };
    };
    debug.__lumen = {
      status: () => bathEngine.status(),
      voices: () => bathEngine.voiceCount(),
      energy: () => bathEngine.readEnergy(),
      fundHz: (id?: string) => bathEngine.fundHz(id),
      context: () => bathEngine.contextState(),
    };
    const kick = () => begin();
    const timer = window.setTimeout(kick, 60);
    return () => {
      window.clearTimeout(timer);
      unbind();
      bathEngine.onTransport = null;
      bathEngine.onNotice = null;
      bathEngine.onOutput = null;
      bathEngine.stop();
    };
  }, [hydrate]);

  useEffect(() => {
    const label = soundscapeTitle({ activeName, presetId });
    bathEngine.remember(bowls, settings, label);
    if (playing && bathEngine.isRunning()) bathEngine.sync(bowls, settings, label);
  }, [bowls, settings, playing, activeName, presetId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => useBath.getState().setNotice(null), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
      if (bathEngine.isRunning() && bathEngine.contextState() === "running") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-transport]")) return;
      begin();
    }
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (useBath.getState().playing) pause();
        else begin();
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const id = useBath.getState().selectedId;
        if (id) useBath.getState().removeBowl(id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function togglePlay() {
    if (useBath.getState().playing) pause();
    else begin();
  }

  const pitch = selected ? describePitch(selected.frequency) : null;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <header className="z-30 flex items-center gap-2 px-3 pt-3 pb-2">
        <h1 className="font-display text-2xl leading-none text-fg">Lumen Bath</h1>
        <button
          type="button"
          data-transport
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-gold px-4 text-base font-medium text-bg"
          onClick={togglePlay}
          aria-pressed={playing}
          aria-label={playing ? "Pause the bath" : "Play the bath"}
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="hidden h-11 min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3 text-left text-sm sm:block"
          onClick={() => setPresetsOpen(true)}
        >
          {title}
        </button>
        <label className="ml-auto hidden items-center gap-2 md:flex">
          <Volume2 className="size-4 text-muted" aria-hidden="true" />
          <span className="sr-only">Volume</span>
          <input
            className="h-11 w-24"
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(event) => setSettings({ volume: Number(event.target.value) / 100 })}
          />
        </label>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-md border border-line text-fg"
          onClick={() => setLibraryOpen(true)}
          aria-label="Soundscapes"
        >
          <Library className="size-5" />
        </button>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-md border border-line text-fg"
          onClick={() => setSettingsOpen(true)}
          aria-label="Session settings"
        >
          <Settings className="size-5" />
        </button>
      </header>
      <button
        type="button"
        className="mx-3 mb-2 h-11 truncate rounded-md border border-line bg-surface px-3 text-left text-sm sm:hidden"
        onClick={() => setPresetsOpen(true)}
      >
        {title}
      </button>
      {notice ? (
        <p className="pointer-events-none absolute top-20 left-1/2 z-30 max-w-sm -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-center text-sm text-fg" role="status">
          {notice}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <Stage onPick={() => setSheet(true)} />
        {!playing ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/55">
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
        <aside className="absolute top-2 right-3 bottom-3 z-20 hidden w-80 overflow-y-auto rounded-lg border border-line bg-surface/95 p-4 lg:block">
          <Inspector />
        </aside>
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:hidden">
          <button
            type="button"
            className="flex h-14 w-full items-center justify-between gap-3 px-4 text-left"
            onClick={() => setSheet((open) => !open)}
            aria-expanded={sheet}
          >
            <span className="min-w-0 truncate text-sm">
              {selected && pitch
                ? `${shortNote(selected.frequency)} · ${pitch.hzLabel} Hz · ${GLASS[selected.glass].label}`
                : "Bowl"}
            </span>
            <ChevronUp className={`size-5 shrink-0 text-muted ${sheet ? "rotate-180" : ""}`} />
          </button>
          {sheet ? (
            <div className="max-h-96 overflow-y-auto px-4 pb-4">
              <Inspector />
            </div>
          ) : null}
        </div>
      </div>
      <PresetDialog open={presetsOpen} onOpenChange={setPresetsOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
    </main>
  );
}
