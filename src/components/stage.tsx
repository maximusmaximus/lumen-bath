import { AudioLines, Plus, RotateCcw, RotateCw, Shell } from "lucide-react";
import { Chamber, nudgeView } from "@/components/chamber";
import { GuideCard, useGuide } from "@/components/guide";
import { SelectionMenu } from "@/components/selection-menu";
import { TouchAdjust } from "@/components/touch-adjust";
import { MAX_BOWLS, MAX_DOMES, MAX_EARS } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

function turnEar(delta: number) {
  const yaw = useBath.getState().receiver.yaw;
  useBath.getState().turnReceiver(yaw + delta);
  nudgeView(delta);
}

export function Stage({
  onPick,
  onRoom,
  onClear,
  onSettings,
  waves,
  onWaves,
  quiet,
  present = false,
}: {
  onPick: () => void;
  onRoom: () => void;
  onClear: () => void;
  onSettings: () => void;
  waves: boolean;
  onWaves: (open: boolean) => void;
  quiet: boolean;
  present?: boolean;
}) {
  const bowls = useBath((state) => state.bowls);
  const addBowl = useBath((state) => state.addBowl);
  const addEar = useBath((state) => state.addEar);
  const addDome = useBath((state) => state.addDome);
  const ears = useBath((state) => state.ears);
  const domes = useBath((state) => state.domes);
  const guideOpen = useGuide((state) => state.open);
  const toggleGuide = useGuide((state) => state.toggle);

  const veil = quiet ? "pointer-events-none opacity-0 transition-opacity duration-1000" : "opacity-100 transition-opacity duration-700";

  return (
    <div className="absolute inset-0" data-waves={waves ? "open" : "closed"}>
      <div className="absolute inset-0 z-0">
        <Chamber onPick={onPick} onRoom={onRoom} onClear={onClear} viewOnly={present} waves={waves} />
      </div>
      {waves && !present ? (
        <p className="pointer-events-none absolute top-3 left-1/2 z-20 max-w-sm -translate-x-1/2 rounded-full bg-surface/80 px-4 py-2 text-center text-xs text-fg">
          Shells leave each bowl in three dimensions, bounce off the walls, and fall back down from any dome they rise into.
        </p>
      ) : null}
      {present ? null : (
      <div className={`pointer-events-none absolute inset-0 z-30 ${veil}`}>
      <SelectionMenu onPick={onPick} quiet={quiet} />
      <div className={`pointer-events-auto absolute top-3 right-3 z-20 flex flex-col items-end ${quiet ? "pointer-events-none" : ""}`}>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-gold bg-surface/90 text-sm text-gold"
          aria-pressed={guideOpen}
          aria-label="Walk through the features"
          onClick={toggleGuide}
        >
          i
        </button>
        {guideOpen ? <div className="mt-2"><GuideCard /></div> : null}
      </div>
      <div className={`pointer-events-auto absolute bottom-24 left-3 z-10 flex flex-wrap items-center gap-2 lg:bottom-4 ${quiet ? "pointer-events-none" : ""}`}>
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
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-gold bg-surface/90 text-gold disabled:opacity-40"
          onClick={() => {
            addEar();
            onPick();
          }}
          disabled={ears.length >= MAX_EARS}
          aria-label="Add a recording stem ear"
          title="Add a recording stem"
        >
          <Plus className="size-5" />
        </button>
        <span className="rounded-full bg-surface/90 px-3 py-2 text-sm tabular-nums text-muted" title="The first ear is what you hear. The rest are recording stems.">
          {ears.length} / {MAX_EARS}
        </span>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-gold bg-surface/90 text-gold disabled:opacity-40"
          onClick={() => {
            addDome();
            onPick();
          }}
          disabled={domes.length >= MAX_DOMES}
          aria-label="Hang a dome face-down"
          title="Hang a dome"
        >
          <Shell className="size-5" />
        </button>
        <span className="rounded-full bg-surface/90 px-3 py-2 text-sm tabular-nums text-muted" title="Domes hang face-down and send rising waves back down.">
          {domes.length} / {MAX_DOMES}
        </span>
        <button
          type="button"
          data-turn="left"
          className="hidden size-11 place-items-center rounded-full border border-line bg-surface/90 text-fg sm:grid"
          aria-label="Turn left through the room"
          onClick={() => turnEar(-0.45)}
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          data-turn="right"
          className="hidden size-11 place-items-center rounded-full border border-line bg-surface/90 text-fg sm:grid"
          aria-label="Turn right through the room"
          onClick={() => turnEar(0.45)}
        >
          <RotateCw className="size-4" />
        </button>
      </div>
      <div className={`pointer-events-auto absolute right-3 bottom-32 z-20 flex items-center gap-2 lg:bottom-24 ${quiet ? "pointer-events-none" : ""}`}>
        <TouchAdjust onSettings={onSettings} />
        <button
          type="button"
          data-waves-toggle
          aria-pressed={waves}
          aria-label={waves ? "Hide the waves" : "Show the waves"}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-gold bg-surface/90 px-4 text-sm text-gold"
          onClick={() => onWaves(!waves)}
        >
          <AudioLines className="size-4" />
          Waves
          <span className="text-xs font-medium">New!</span>
        </button>
      </div>
      </div>
      )}
    </div>
  );
}
