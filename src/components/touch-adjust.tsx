import { Settings } from "lucide-react";
import { Slider } from "@/components/controls";
import { DOME_SIZE_MAX, DOME_SIZE_MIN, HALL_DIAMETER } from "@/lib/audio/dome";
import { useBath } from "@/stores/bath";

/** Compact sliders for the thing in hand, so a phone can resize without the full inspector. */
export function TouchAdjust({ onSettings }: { onSettings: () => void }) {
  const focus = useBath((state) => state.focus);
  const bowls = useBath((state) => state.bowls);
  const ears = useBath((state) => state.ears);
  const domes = useBath((state) => state.domes);
  const selectedId = useBath((state) => state.selectedId);
  const activeEarId = useBath((state) => state.activeEarId);
  const selection = useBath((state) => state.selection);
  const updateDome = useBath((state) => state.updateDome);
  const scaleGroup = useBath((state) => state.scaleGroup);
  const updateEarSide = useBath((state) => state.updateEarSide);
  const ear = ears.find((item) => item.id === activeEarId) ?? ears[0];
  const dome = domes.find((item) => item.id === selectedId);
  const bowl = bowls.find((item) => item.id === selectedId) ?? bowls[0];

  function growBowls(value: number) {
    const ids = new Set(selection.filter((id) => id.startsWith("b:")).map((id) => id.slice(2)));
    if (selectedId) ids.add(selectedId);
    const picked = bowls.filter((item) => ids.has(item.id));
    if (!picked.length) return;
    const avg = picked.reduce((sum, item) => sum + item.size, 0) / picked.length;
    const delta = value / 100 - avg;
    scaleGroup({
      bowls: picked.map((item) => ({ id: item.id, size: item.size + delta })),
    });
  }

  function scaleCones(value: number) {
    if (!ear) return;
    const next = value / 100;
    updateEarSide(ear.id, "left", { size: next });
    updateEarSide(ear.id, "right", { size: next });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full border border-line bg-surface/90 text-fg"
        aria-label="Open settings"
        onClick={onSettings}
      >
        <Settings className="size-4" />
      </button>
      <div className="w-36 max-w-[42vw] rounded-2xl border border-line bg-surface/90 px-3 py-2 sm:w-56 sm:max-w-none">
        {focus === "ear" && ear ? (
          <Slider
            label="Cone size"
            hint="How large both cones are. A bigger cone reaches more of the glass. An edge of the box in the room does the same. The cones stay above the floor."
            min={28}
            max={180}
            step={1}
            value={Math.round(((ear.left.size + ear.right.size) / 2) * 100)}
            display={`${Math.round(((ear.left.size + ear.right.size) / 2) * 100)}`}
            onChange={scaleCones}
          />
        ) : focus === "dome" && dome ? (
          <>
            <Slider
              label="Scale"
              hint={`How wide the opening is. The top matches the hall, ${HALL_DIAMETER.toFixed(1)} m across.`}
              min={Math.round(DOME_SIZE_MIN * 100)}
              max={Math.round(DOME_SIZE_MAX * 100)}
              step={1}
              value={Math.round(dome.size * 100)}
              display={`${Math.round(dome.size * 100)}`}
              onChange={(value) => updateDome(dome.id, { size: value / 100 })}
            />
            <Slider
              label="Height"
              hint="How high the face-down rim sits. Higher sends the bounce back later."
              min={55}
              max={320}
              step={1}
              value={Math.round(dome.height * 100)}
              display={`${dome.height.toFixed(2)}`}
              onChange={(value) => updateDome(dome.id, { height: value / 100 })}
            />
          </>
        ) : bowl ? (
          <Slider
            label="Width"
            hint="Diameter. Wider glass is warmer and carries farther. Pitch stays where you set it. It will not grow into another bowl or an ear. Drag a corner of the box to do the same."
            min={36}
            max={100}
            step={1}
            value={Math.round(bowl.size * 100)}
            display={`${Math.round(bowl.size * 100)}`}
            onChange={growBowls}
          />
        ) : null}
      </div>
    </div>
  );
}
