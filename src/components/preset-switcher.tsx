import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { PRESETS, getPreset } from "@/lib/audio/presets";
import { notePresetOpen, notePresetVote } from "@/lib/community/preset-stats";
import { useBath } from "@/stores/bath";

function step(dir: -1 | 1) {
  const state = useBath.getState();
  const current = state.presetId ?? state.originPresetId;
  const index = PRESETS.findIndex((preset) => preset.id === current);
  const from = index < 0 ? (dir > 0 ? -1 : 0) : index;
  const next = PRESETS[(from + dir + PRESETS.length) % PRESETS.length];
  if (!next || next.id === current) return;
  if (current) notePresetVote(current, dir > 0 ? "up" : "down");
  useBath.getState().applyPreset(next.id, { history: false });
  notePresetOpen(next.id);
}

/** Thumb reach for the next and previous preset. Hides once two things have been moved. */
export function PresetSwitcher({ hidden = false, quiet = false }: { hidden?: boolean; quiet?: boolean }) {
  const presetId = useBath((state) => state.presetId);
  const originId = useBath((state) => state.originPresetId);
  const [mini, setMini] = useState(false);
  const moved = useRef(new Set<string>());
  const held = useRef(false);
  const name = getPreset(presetId ?? originId ?? "")?.name ?? "Preset";

  useEffect(() => {
    return useBath.subscribe((state, prev) => {
      if (!prev) return;
      if (state.presetId !== prev.presetId || state.loadStamp !== prev.loadStamp) {
        moved.current = new Set();
        held.current = false;
        setMini(false);
        return;
      }
      if (state.bowls !== prev.bowls) {
        for (const bowl of state.bowls) {
          const before = prev.bowls.find((item) => item.id === bowl.id);
          if (!before) continue;
          if (before.x !== bowl.x || before.y !== bowl.y || before.size !== bowl.size || before.height !== bowl.height) {
            moved.current.add(bowl.id);
          }
        }
      }
      if (state.ears !== prev.ears) {
        for (const ear of state.ears) {
          const before = prev.ears.find((item) => item.id === ear.id);
          if (!before) continue;
          if (before.x !== ear.x || before.y !== ear.y || before.height !== ear.height || before.yaw !== ear.yaw || before.pitch !== ear.pitch) {
            moved.current.add(`e:${ear.id}`);
          }
        }
      }
      if (moved.current.size > 1 && !held.current) setMini(true);
    });
  }, []);

  if (hidden) return null;
  const veil = quiet ? "pointer-events-none opacity-0" : "opacity-100";
  const button =
    "pointer-events-auto grid size-9 place-items-center rounded-full border border-line bg-surface/90 text-fg shadow-md backdrop-blur-sm transition-opacity sm:size-10";

  if (mini) {
    return (
      <button
        type="button"
        className={`absolute bottom-16 left-2 z-30 sm:bottom-20 lg:bottom-3 ${button} ${veil}`}
        onClick={() => {
          held.current = true;
          setMini(false);
        }}
        aria-label="Show the preset switcher"
      >
        <ThumbsUp className="size-4" />
      </button>
    );
  }

  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-16 z-30 transition-opacity duration-700 sm:bottom-20 lg:bottom-3 ${veil}`}>
      <button type="button" className={`absolute left-2 bottom-0 ${button}`} onClick={() => step(-1)} aria-label="Thumbs down, previous preset">
        <ThumbsDown className="size-4" />
      </button>
      <p className="pointer-events-none absolute bottom-1 left-1/2 max-w-[42vw] -translate-x-1/2 truncate rounded-full bg-surface/80 px-2.5 py-1 text-[10px] text-muted shadow-sm sm:text-xs">
        {name}
      </p>
      <button type="button" className={`absolute right-14 bottom-0 sm:right-16 ${button}`} onClick={() => step(1)} aria-label="Thumbs up, next preset">
        <ThumbsUp className="size-4" />
      </button>
    </div>
  );
}
