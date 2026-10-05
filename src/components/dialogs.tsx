import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Slider, InfoPoint } from "@/components/controls";
import { DownloadMark } from "@/components/download-mark";
import { SessionPanel } from "@/components/session-panel";
import { PRESETS, PRESET_TAGS, presetIsDownload } from "@/lib/audio/presets";
import { proposeWeeklyPresets } from "@/lib/community/api";
import { loadPresetStats, notePresetOpen, notePresetPlay, notePresetTag } from "@/lib/community/preset-stats";
import type { PresetStat } from "@/lib/community/types";
import { FRESH_SHAPES, getRoom, ROOM_EFFECTS, ROOMS } from "@/lib/audio/rooms";
import { minRoomSize } from "@/lib/audio/space";
import { useBath } from "@/stores/bath";

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

export function PresetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const presetId = useBath((state) => state.presetId);
  const applyPreset = useBath((state) => state.applyPreset);
  const [stats, setStats] = useState<Record<string, PresetStat>>({});
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "features" | "loved" | "played" | "name">("new");
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    loadPresetStats()
      .then((map) => {
        if (!cancel) setStats(map);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [open]);
  const shown = useMemo(() => {
    const rows = PRESETS.map((preset, index) => ({ preset, index })).filter((row) => !tag || row.preset.tags.includes(tag));
    const loved = (id: string) => {
      const row = stats[id];
      if (!row) return 0;
      return row.plays + row.saves * 3 + row.stemSaves * 2 + row.ups * 4 - row.downs * 3;
    };
    if (sort === "name") rows.sort((a, b) => a.preset.name.localeCompare(b.preset.name) || a.index - b.index);
    else if (sort === "played") rows.sort((a, b) => (stats[b.preset.id]?.plays ?? 0) - (stats[a.preset.id]?.plays ?? 0) || a.index - b.index);
    else if (sort === "loved") rows.sort((a, b) => loved(b.preset.id) - loved(a.preset.id) || a.index - b.index);
    else if (sort === "new") {
      const rank = (tags: string[], source?: string) => (tags.includes("New") ? 0 : source === "ai" ? 1 : 2);
      rows.sort((a, b) => rank(a.preset.tags, a.preset.source) - rank(b.preset.tags, b.preset.source) || b.index - a.index);
    } else if (sort === "features") {
      const feature = (tags: string[]) => tags.find((tag) => tag !== "New" && tag !== "AI generated") ?? "";
      rows.sort((a, b) => feature(a.preset.tags).localeCompare(feature(b.preset.tags)) || Number(b.preset.tags.includes("New")) - Number(a.preset.tags.includes("New")) || a.preset.name.localeCompare(b.preset.name));
    }
    return rows.map((row) => row.preset);
  }, [sort, stats, tag]);
  const sorts = [
    ["new", "New"],
    ["features", "Features"],
    ["loved", "Loved"],
    ["played", "Played"],
    ["name", "Name"],
  ] as const;
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Presets">
      <div className="grid gap-3">
        <p className="text-pretty text-sm text-muted">
          Every bath has the new horns. New is the latest set, Features groups them by what they use, and a tag keeps one set. The five new domes show a hall-wide shell, a focused cup, a split return, a late ceiling, and a soft frost.
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={tag === null}
            className={`shrink-0 min-h-9 rounded-full border px-2.5 text-xs ${tag === null ? "border-gold bg-gold/15 text-gold" : "border-line text-fg"}`}
            onClick={() => setTag(null)}
          >
            All
          </button>
          {["New", "Dome", "Horns", "Cycle", "Download", "Listening"]
            .filter((item) => PRESET_TAGS.includes(item))
            .concat(PRESET_TAGS.filter((item) => !["New", "Dome", "AI generated", "Horns", "Cycle", "Download", "Listening"].includes(item)))
            .map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tag === item}
              className={`shrink-0 min-h-9 rounded-full border px-2.5 text-xs ${tag === item ? "border-gold bg-gold/15 text-gold" : "border-line text-muted"}`}
              onClick={() => {
                const next = tag === item ? null : item;
                setTag(next);
                if (next) notePresetTag(next);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {sorts.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              className={`min-h-9 rounded-md border px-2.5 text-xs ${sort === id ? "border-gold bg-gold/15 text-gold" : "border-line text-fg"}`}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="min-h-9 rounded-md px-2.5 text-xs text-gold disabled:opacity-50"
            disabled={drafting}
            onClick={() => {
              setDrafting(true);
              proposeWeeklyPresets()
                .then((result) => setDraft(result.proposal))
                .catch(() => setDraft("The week could not be drafted just now."))
                .finally(() => setDrafting(false));
            }}
          >
            {drafting ? "Drafting…" : "Draft the week"}
          </button>
        </div>
        {draft ? <p className="text-pretty whitespace-pre-wrap text-sm text-muted">{draft}</p> : null}
        {shown.length === 0 ? <p className="text-sm text-muted">Nothing uses that tag.</p> : null}
        {shown.map((preset) => {
          const active = preset.id === presetId;
          const row = stats[preset.id];
          const plays = row?.plays ?? 0;
          const saves = row?.saves ?? 0;
          const stemSaves = row?.stemSaves ?? 0;
          return (
            <button
              key={preset.id}
              type="button"
              className={`rounded-md border px-3 py-3 text-left ${active ? "border-gold bg-bg" : "border-line bg-bg/40"}`}
              onClick={() => {
                applyPreset(preset.id);
                notePresetOpen(preset.id);
                if (useBath.getState().playing) notePresetPlay(preset.id);
                onOpenChange(false);
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-display text-2xl text-fg">{preset.name}</span>
                  {preset.tags.includes("New") ? <span className="shrink-0 text-[10px] tracking-wide text-gold uppercase">New</span> : null}
                  {preset.source === "ai" ? <span className="shrink-0 text-[10px] tracking-wide text-gold uppercase">AI generated</span> : null}
                  {presetIsDownload(preset) ? <DownloadMark /> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {preset.bowls.length} bowls
                  {preset.ears && preset.ears.length > 1 ? ` · ${preset.ears.length} ears` : ""}
                </span>
              </span>
              <span className="mt-1 block text-pretty text-sm text-muted">{preset.blurb}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                {preset.tags.map((item) => (
                  <span
                    key={item}
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] ${item === "New" || item === "Dome" ? "border-gold text-gold" : "border-line text-muted"}`}
                  >
                    {item}
                  </span>
                ))}
              </span>
              <span className="mt-1 block text-xs tabular-nums text-muted">
                {plays} {plays === 1 ? "play" : "plays"} · {saves} {saves === 1 ? "save" : "saves"}
                {stemSaves > 0 ? ` · ${stemSaves} ${stemSaves === 1 ? "stem save" : "stem saves"}` : ""}
                {(row?.ups ?? 0) > 0 ? ` · ${row?.ups} up` : ""}
                {(row?.downs ?? 0) > 0 ? ` · ${row?.downs} down` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function RoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useBath((state) => state.settings);
  const bowls = useBath((state) => state.bowls);
  const setSettings = useBath((state) => state.setSettings);
  const setRoom = useBath((state) => state.setRoom);
  const room = getRoom(settings.roomShape);
  const minSize = minRoomSize(settings, bowls);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Room">
      <div className="grid gap-6">
        <section className="grid gap-3">
          <InfoPoint hint={`${room.blurb} Bowls and ears keep their size when the room changes. A wider shape opens floor you can drag into. The room will not shrink inside their combined diameter. Bowls stop at each other and at ears. Cones and boxes stay above the floor. Starts large. The walls stay glass.`}>
            <h2 className="font-display text-2xl text-fg">Shape</h2>
          </InfoPoint>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ROOMS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-shape={item.id}
                aria-pressed={settings.roomShape === item.id}
                className={`min-h-11 rounded-md border px-2 py-2 text-sm ${settings.roomShape === item.id ? "border-gold text-gold" : "border-line text-fg"}`}
                onClick={() => setRoom(item.id)}
              >
                {item.label}
                {FRESH_SHAPES.has(item.id) ? <span className="mt-0.5 block text-xs text-gold">New!</span> : null}
              </button>
            ))}
          </div>
          <Slider
            label="Room size"
            fresh
            guideId="room-size"
            hint="Grows or shrinks the floor. Bowls and ears can be dragged anywhere on the new floor, out to the walls. The room will not shrink inside them, and they stop when they meet."
            min={Math.min(80, Math.max(10, Math.min(Math.round(settings.size * 10), Math.round(minSize * 10))))}
            max={80}
            step={1}
            value={Math.round(settings.size * 10)}
            display={`${settings.size.toFixed(1)}×`}
            onChange={(value) => setSettings({ size: value / 10 })}
          />
        </section>
        <section className="grid gap-3">
          <InfoPoint hint="Choosing a shape sets these ten. Move any of them afterward. Decay is the tail. Early reflections are the first bounce. Flutter and slapback are echoes. Standing waves and bass bloom fatten the low end. Air loss dulls bowls that sit far from the ear. Envelopment wraps the tail around you.">
            <h2 className="font-display text-2xl text-fg">How the room colors the sound</h2>
          </InfoPoint>
          {ROOM_EFFECTS.map((effect) => (
            <Slider
              key={effect.key}
              label={effect.label}
              hint={effect.hint}
              guideId={effect.key}
              min={0}
              max={100}
              step={1}
              value={Math.round(settings[effect.key] * 100)}
              display={`${Math.round(settings[effect.key] * 100)}`}
              onChange={(value) => setSettings({ [effect.key]: value / 100 })}
            />
          ))}
        </section>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Session">
      <SessionPanel />
    </Modal>
  );
}
