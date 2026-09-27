import { Plus } from "lucide-react";
import { Chamber } from "@/components/chamber";
import { Slider } from "@/components/controls";
import { MAX_BOWLS } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

export function Stage({ onPick }: { onPick: () => void }) {
  const bowls = useBath((state) => state.bowls);
  const receiver = useBath((state) => state.receiver);
  const addBowl = useBath((state) => state.addBowl);
  const moveReceiver = useBath((state) => state.moveReceiver);

  return (
    <div className="absolute inset-0">
      <Chamber onPick={onPick} />
      <div className="pointer-events-none absolute top-3 left-3 z-10 w-44 rounded-lg border border-line bg-surface/90 p-3">
        <div className="pointer-events-auto">
          <Slider
            label="Ear height"
            min={0}
            max={100}
            step={1}
            value={Math.round(receiver.height * 100)}
            display={receiver.height < 0.34 ? "Low" : receiver.height > 0.72 ? "High" : "Seated"}
            onChange={(value) => moveReceiver(receiver.x, receiver.y, value / 100)}
          />
        </div>
        <p className="mt-1 text-pretty text-xs text-muted">Drag the orb up and down. Drag the stand to walk the ear.</p>
      </div>
      <div className="absolute bottom-24 left-3 z-10 flex items-center gap-2 lg:bottom-4">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full bg-gold text-bg disabled:opacity-40"
          onClick={addBowl}
          disabled={bowls.length >= MAX_BOWLS}
          aria-label="Add bowl"
        >
          <Plus className="size-5" />
        </button>
        <span className="rounded-full bg-surface/90 px-3 py-2 text-sm tabular-nums text-muted">
          {bowls.length} / {MAX_BOWLS}
        </span>
      </div>
      <p className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-sm text-muted md:block">
        Drag a bowl, or the ear — that is what you hear and what is recorded
      </p>
    </div>
  );
}
