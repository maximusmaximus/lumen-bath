import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Slider } from "@/components/controls";
import { GLASS, GLASS_IDS } from "@/lib/audio/glass";
import { describePitch, hzToUnit, nearestBeat, unitToHz } from "@/lib/audio/notes";
import { MIN_BOWLS } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

export function Inspector() {
  const bowls = useBath((state) => state.bowls);
  const selectedId = useBath((state) => state.selectedId);
  const updateBowl = useBath((state) => state.updateBowl);
  const removeBowl = useBath((state) => state.removeBowl);
  const bowl = bowls.find((item) => item.id === selectedId) ?? bowls[0];
  const [hzText, setHzText] = useState("");
  const [hzFocused, setHzFocused] = useState(false);

  useEffect(() => {
    if (!hzFocused && bowl) setHzText(bowl.frequency.toFixed(2));
  }, [bowl, hzFocused]);

  if (!bowl) return null;
  const pitch = describePitch(bowl.frequency);
  const beat = nearestBeat(bowl, bowls);
  const glass = GLASS[bowl.glass];

  return (
    <div className="grid gap-4">
      <div>
        <p className="font-display text-3xl leading-none text-fg">{pitch.note}</p>
        <p className="mt-1 text-sm text-muted">{glass.label}</p>
      </div>
      <label className="grid gap-1 text-sm text-muted">
        Glass
        <select
          className="h-11 rounded-md border border-line bg-surface-2 px-3 text-fg"
          value={bowl.glass}
          onChange={(event) => updateBowl(bowl.id, { glass: event.target.value as typeof bowl.glass })}
        >
          {GLASS_IDS.map((id) => (
            <option key={id} value={id}>
              {GLASS[id].label}
            </option>
          ))}
        </select>
        <span className="text-pretty text-xs">{glass.description}</span>
      </label>
      <Slider
        label="Frequency"
        min={0}
        max={1000}
        step={1}
        value={Math.round(hzToUnit(bowl.frequency) * 1000)}
        display={`${pitch.hzLabel} Hz`}
        onChange={(unit) => updateBowl(bowl.id, { frequency: unitToHz(unit / 1000) })}
      />
      <label className="grid gap-1 text-sm text-muted">
        Exact hertz
        <input
          className="h-11 rounded-md border border-line bg-surface-2 px-3 tabular-nums text-fg"
          inputMode="decimal"
          value={hzFocused ? hzText : bowl.frequency.toFixed(2)}
          onFocus={() => {
            setHzFocused(true);
            setHzText(bowl.frequency.toFixed(2));
          }}
          onChange={(event) => setHzText(event.target.value)}
          onBlur={() => {
            setHzFocused(false);
            const next = Number(hzText);
            if (Number.isFinite(next)) updateBowl(bowl.id, { frequency: next });
          }}
        />
      </label>
      {beat !== null ? (
        <p className="text-pretty text-sm text-gold">
          {beat < 0.05 ? "Locked with another bowl." : `${beat.toFixed(2)} Hz beat with a nearby bowl.`}
        </p>
      ) : null}
      <Slider
        label="Size"
        min={36}
        max={100}
        step={1}
        value={Math.round(bowl.size * 100)}
        display={`${Math.round(bowl.size * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { size: value / 100 })}
      />
      <p className="text-pretty text-xs text-muted">
        Size warms the voice and slows the rim. Pitch stays where you set it.
      </p>
      <Slider
        label="Level"
        min={5}
        max={100}
        step={1}
        value={Math.round(bowl.gain * 100)}
        display={`${Math.round(bowl.gain * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { gain: value / 100 })}
      />
      <Slider
        label="Rim"
        min={0}
        max={100}
        step={1}
        value={Math.round(bowl.sing * 100)}
        display={`${Math.round(bowl.sing * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { sing: value / 100 })}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="h-11 flex-1 rounded-md border border-line text-sm text-fg"
          onClick={() => updateBowl(bowl.id, { muted: !bowl.muted })}
        >
          {bowl.muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-md border border-line text-fg disabled:opacity-40"
          onClick={() => removeBowl(bowl.id)}
          disabled={bowls.length <= MIN_BOWLS}
          aria-label="Remove bowl"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
