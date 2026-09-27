import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Slider, Toggle } from "@/components/controls";
import { bathEngine } from "@/lib/audio/engine";
import { periodRange } from "@/lib/audio/notes";
import { PRESETS } from "@/lib/audio/presets";
import type { LoopMode, Soundscape } from "@/lib/audio/types";
import { exportPayload, parseImport, useBath } from "@/stores/bath";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80" />
        <Dialog.Content className="modal-sheet">
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <Dialog.Title className="font-display text-3xl text-fg">{title}</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-md text-muted" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const MODES: { id: LoopMode; label: string; copy: string }[] = [
  { id: "continuous", label: "Sustain", copy: "Endless ring. The default loop." },
  { id: "breath", label: "Breath", copy: "The whole bath swells and eases together." },
  { id: "tide", label: "Tide", copy: "A long rise and a shorter fall, then again." },
  { id: "mallet", label: "Mallet", copy: "Soft strikes, staggered, then the cycle repeats." },
  { id: "canon", label: "Canon", copy: "Bowls enter one after another, hold, and release." },
];

export function PresetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const presetId = useBath((state) => state.presetId);
  const applyPreset = useBath((state) => state.applyPreset);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Presets">
      <div className="grid gap-2">
        {PRESETS.map((preset) => {
          const active = preset.id === presetId;
          return (
            <button
              key={preset.id}
              type="button"
              className={`rounded-md border px-3 py-3 text-left ${active ? "border-gold bg-bg" : "border-line bg-bg/40"}`}
              onClick={() => {
                applyPreset(preset.id);
                onOpenChange(false);
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-2xl text-fg">{preset.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{preset.bowls.length} bowls</span>
              </span>
              <span className="mt-1 block text-pretty text-sm text-muted">{preset.blurb}</span>
              <span className="mt-2 block text-xs text-gold">{preset.tags.join(" · ")}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useBath((state) => state.settings);
  const setSettings = useBath((state) => state.setSettings);
  const range = periodRange(settings.loopMode);
  const modeCopy = MODES.find((mode) => mode.id === settings.loopMode)?.copy;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Session">
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-fg">Phrase</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`h-11 rounded-md border text-sm ${settings.loopMode === mode.id ? "border-gold text-gold" : "border-line text-fg"}`}
                onClick={() => setSettings({ loopMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-pretty text-sm text-muted">{modeCopy}</p>
          {range ? (
            <Slider
              label={
                settings.loopMode === "mallet"
                  ? "Strike cycle"
                  : settings.loopMode === "canon"
                    ? "Canon length"
                    : settings.loopMode === "tide"
                      ? "Tide length"
                      : "Breath length"
              }
              min={range[0]}
              max={range[1]}
              step={1}
              value={settings.period}
              display={`${Math.round(settings.period)} s`}
              onChange={(period) => setSettings({ period })}
            />
          ) : (
            <p className="text-sm text-muted">Sustain does not restart. It simply continues.</p>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-fg">Interference</h2>
          <Slider
            label="Veil"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.veil * 100)}
            display={`${Math.round(settings.veil * 100)}`}
            onChange={(value) => setSettings({ veil: value / 100 })}
          />
          <Slider
            label="Veil beat"
            min={15}
            max={180}
            step={1}
            value={Math.round(settings.veilHz * 100)}
            display={`${settings.veilHz.toFixed(2)} Hz`}
            onChange={(value) => setSettings({ veilHz: value / 100 })}
          />
          <p className="text-pretty text-xs text-muted">
            A quiet twin on every bowl. Each one is detuned slightly differently, so the beats don’t lock.
          </p>
          <Slider
            label="Crown shimmer"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.shimmer * 100)}
            display={`${Math.round(settings.shimmer * 100)}`}
            onChange={(value) => setSettings({ shimmer: value / 100 })}
          />
          <Slider
            label="Room width"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.width * 100)}
            display={`${Math.round(settings.width * 100)}`}
            onChange={(value) => setSettings({ width: value / 100 })}
          />
          <Slider
            label="Room depth"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.depth * 100)}
            display={`${Math.round(settings.depth * 100)}`}
            onChange={(value) => setSettings({ depth: value / 100 })}
          />
          <p className="text-pretty text-xs text-muted">
            The bowls and the ear share this room. What you see is what you hear, and what gets recorded.
          </p>
          <Toggle
            label="Hemisphere bed"
            hint="Two quiet sines, hard left and right, a fraction apart. Raise the beat only on headphones — on speakers it pulses."
            checked={settings.binaural}
            onCheckedChange={(binaural) => setSettings({ binaural })}
          />
          {settings.binaural ? (
            <>
              <Slider
                label="Bed pitch"
                min={70}
                max={220}
                step={1}
                value={settings.binauralCarrier}
                display={`${Math.round(settings.binauralCarrier)} Hz`}
                onChange={(binauralCarrier) => setSettings({ binauralCarrier })}
              />
              <Slider
                label="Bed beat"
                min={2}
                max={80}
                step={1}
                value={Math.round(settings.binauralBeat * 10)}
                display={`${settings.binauralBeat.toFixed(1)} Hz`}
                onChange={(value) => setSettings({ binauralBeat: value / 10 })}
              />
              <Slider
                label="Bed level"
                min={0}
                max={100}
                step={1}
                value={Math.round(settings.binauralLevel * 100)}
                display={`${Math.round(settings.binauralLevel * 100)}`}
                onChange={(value) => setSettings({ binauralLevel: value / 100 })}
              />
            </>
          ) : null}
        </section>

        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-fg">Glass hall</h2>
          <Slider
            label="Hall"
            min={0}
            max={80}
            step={1}
            value={Math.round(settings.wet * 100)}
            display={`${Math.round(settings.wet * 100)}`}
            onChange={(value) => setSettings({ wet: value / 100 })}
          />
          <Slider
            label="Hall size"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.hall * 100)}
            display={`${Math.round(settings.hall * 100)}`}
            onChange={(value) => setSettings({ hall: value / 100 })}
          />
          <Slider
            label="Silk"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.air * 100)}
            display={`${Math.round(settings.air * 100)}`}
            onChange={(value) => setSettings({ air: value / 100 })}
          />
          <p className="text-pretty text-xs text-muted">
            The dry crystal stays full. The hall only sits behind it. Silk trims the top if a small bowl glares.
          </p>
          <Slider
            label="Transpose"
            min={-100}
            max={100}
            step={1}
            value={settings.transpose}
            display={`${settings.transpose > 0 ? "+" : ""}${settings.transpose} cents`}
            onChange={(transpose) => setSettings({ transpose })}
          />
        </section>

        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-fg">Playback</h2>
          <Toggle
            label="Background session"
            hint="The bowls always play through the speakers. Leave this on to keep a lock-screen title when the tab is in the background."
            checked={settings.output === "session"}
            onCheckedChange={(on) => {
              const output = on ? "session" : "direct";
              setSettings({ output });
              bathEngine.setOutput(output);
            }}
          />
          <Toggle
            label="Keep screen awake"
            hint="Optional. The sound does not need the screen to stay on."
            checked={settings.awake}
            onCheckedChange={(awake) => setSettings({ awake })}
          />
          <Slider
            label="Volume"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.volume * 100)}
            display={`${Math.round(settings.volume * 100)}`}
            onChange={(value) => setSettings({ volume: value / 100 })}
          />
        </section>
      </div>
    </Modal>
  );
}

export function LibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const library = useBath((state) => state.library);
  const activeName = useBath((state) => state.activeName);
  const saveSoundscape = useBath((state) => state.saveSoundscape);
  const loadSoundscape = useBath((state) => state.loadSoundscape);
  const deleteSoundscape = useBath((state) => state.deleteSoundscape);
  const importLibrary = useBath((state) => state.importLibrary);
  const setNotice = useBath((state) => state.setNotice);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setName(activeName ?? "");
  }, [open, activeName]);

  function downloadLibrary() {
    const payload = exportPayload(useBath.getState().library);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lumen-bath-soundscapes.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Soundscapes">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          saveSoundscape(name);
        }}
      >
        <label className="grid gap-1 text-sm text-muted">
          Name
          <input
            className="h-11 rounded-md border border-line bg-surface-2 px-3 text-fg"
            value={name}
            maxLength={48}
            placeholder="Evening quay"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="h-11 rounded-md bg-gold text-sm font-medium text-bg">
          Save in this browser
        </button>
        <div className="flex gap-2">
          <button type="button" className="h-11 flex-1 rounded-md border border-line text-sm" onClick={downloadLibrary}>
            Download
          </button>
          <button
            type="button"
            className="h-11 flex-1 rounded-md border border-line text-sm"
            onClick={() => fileRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const items = parseImport(await file.text());
                if (!items.length) {
                  setNotice("That file had no soundscapes.");
                  return;
                }
                importLibrary(items);
              } catch {
                setNotice("Could not read that file.");
              }
            }}
          />
        </div>
      </form>
      <ul className="mt-4 grid gap-2">
        {library.length === 0 ? (
          <li className="text-pretty text-sm text-muted">Nothing saved yet. Name a bath and it stays on this device.</li>
        ) : (
          library.map((item) => <LibraryRow key={item.id} item={item} onLoad={loadSoundscape} onDelete={deleteSoundscape} />)
        )}
      </ul>
    </Modal>
  );
}

function LibraryRow({
  item,
  onLoad,
  onDelete,
}: {
  item: Soundscape;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(item.updatedAt);
  return (
    <li className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
      <button type="button" className="min-w-0 flex-1 py-2 text-left" onClick={() => onLoad(item.id)}>
        <span className="block truncate text-fg">{item.name}</span>
        <span className="text-xs tabular-nums text-muted">
          {item.bowls.length} bowls · {when}
        </span>
      </button>
      <button type="button" className="h-11 px-2 text-sm text-muted" onClick={() => onDelete(item.id)}>
        Delete
      </button>
    </li>
  );
}
