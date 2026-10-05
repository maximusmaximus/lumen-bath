import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Ear, GitBranch, GripVertical, Trash2 } from "lucide-react";
import { InfoPoint, Slider, InfoBox } from "@/components/controls";
import { cn } from "@/lib/cn";
import { GLASS, GLASS_IDS } from "@/lib/audio/glass";
import { domePoint, DOME_HEIGHT_MAX, DOME_HEIGHT_MIN, DOME_SIZE_MAX, DOME_SIZE_MIN, HALL_DIAMETER } from "@/lib/audio/dome";
import { describePitch, hzToUnit, nearestBeat, unitToHz } from "@/lib/audio/notes";
import { earPitch } from "@/lib/audio/space";
import type { EarSide } from "@/lib/audio/types";
import { MAX_EARS, MIN_BOWLS } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

export function Inspector() {
  const focus = useBath((state) => state.focus);
  return (
    <div className="grid gap-4">
      <FocusSwitch />
      {focus === "ear" ? <EarInspector /> : focus === "dome" ? <DomeInspector /> : <BowlInspector />}
    </div>
  );
}

function FocusSwitch() {
  const focus = useBath((state) => state.focus);
  const selectedId = useBath((state) => state.selectedId);
  const activeEarId = useBath((state) => state.activeEarId);
  const bowls = useBath((state) => state.bowls);
  const domes = useBath((state) => state.domes);
  const select = useBath((state) => state.select);
  const selectEar = useBath((state) => state.selectEar);
  const selectDome = useBath((state) => state.selectDome);
  const addDome = useBath((state) => state.addDome);
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        aria-pressed={focus === "bowl"}
        className={cn(
          "h-11 rounded-md border text-sm",
          focus === "bowl" ? "border-gold text-fg" : "border-line text-muted",
        )}
        onClick={() => {
          const id = selectedId ?? bowls[0]?.id;
          if (id) select(id);
        }}
      >
        Bowl
      </button>
      <button
        type="button"
        aria-pressed={focus === "ear"}
        className={cn(
          "h-11 rounded-md border text-sm",
          focus === "ear" ? "border-gold text-fg" : "border-line text-muted",
        )}
        onClick={() => selectEar(activeEarId)}
      >
        Ear
      </button>
      <button
        type="button"
        aria-pressed={focus === "dome"}
        className={cn(
          "h-11 rounded-md border text-sm",
          focus === "dome" ? "border-gold text-fg" : "border-line text-muted",
        )}
        onClick={() => {
          const existing = domes.find((dome) => dome.id === selectedId) ?? domes[0];
          if (existing) selectDome(existing.id);
          else addDome();
        }}
      >
        Dome
      </button>
    </div>
  );
}

function cm(meters: number): string {
  const n = Math.round(meters * 100);
  if (n === 0) return "0 cm";
  return `${n > 0 ? "+" : ""}${n} cm`;
}

function ChannelSliders({
  earId,
  side,
  channel,
  title,
}: {
  earId: string;
  side: "left" | "right";
  channel: EarSide;
  title: string;
}) {
  const updateEarSide = useBath((state) => state.updateEarSide);
  const set = (patch: Partial<EarSide>) => updateEarSide(earId, side, patch);
  return (
    <div className="grid gap-3 rounded-md border border-line p-3">
      <p className="font-display text-2xl leading-none text-fg">{title}</p>
      <Slider
        label="Cone size"
        fresh
        guideId="ear-side"
        hint="How large this cone is. The red ball inside the horn only changes size: pull it out to make the cone larger, push it in to make it smaller. An edge of the box sizes both cones together. A cone will not grow through the floor or into a bowl."
        min={28}
        max={180}
        step={1}
        value={Math.round(channel.size * 100)}
        display={`${Math.round(channel.size * 100)}`}
        onChange={(value) => set({ size: value / 100 })}
      />
      <Slider
        label="Level"
        fresh
        guideId="ear-side"
        hint="How loud this side is, apart from the other cone. Cycle through keeps this level as the ear moves."
        min={0}
        max={100}
        step={1}
        value={Math.round(channel.gain * 100)}
        display={`${Math.round(channel.gain * 100)}`}
        onChange={(value) => set({ gain: value / 100 })}
      />
      <Slider
        label="Left / right"
        fresh
        guideId="ear-side"
        hint="Slides this cone to the ear’s left or right. It stops at a wall, a bowl, the other cone, and the floor."
        min={-40}
        max={40}
        step={1}
        value={Math.round(channel.x * 100)}
        display={cm(channel.x)}
        onChange={(value) => set({ x: value / 100 })}
      />
      <Slider
        label="Up / down"
        fresh
        guideId="ear-side"
        hint="Raises or lowers this horn. Pull the ball on its back to do the same. The lever behind the head lifts both horns together. It cannot go below the floor, into a wall, into a bowl, or into the other horn."
        min={-40}
        max={40}
        step={1}
        value={Math.round(channel.y * 100)}
        display={cm(channel.y)}
        onChange={(value) => set({ y: value / 100 })}
      />
      <Slider
        label="Forward / back"
        fresh
        guideId="ear-side"
        hint="Moves this cone forward of the head or back behind it. It stops at the walls, the bowls, and the other cone, and it stays above the floor."
        min={-40}
        max={40}
        step={1}
        value={Math.round(channel.z * 100)}
        display={cm(channel.z)}
        onChange={(value) => set({ z: value / 100 })}
      />
    </div>
  );
}

function EarOrder() {
  const ears = useBath((state) => state.ears);
  const activeEarId = useBath((state) => state.activeEarId);
  const selectEar = useBath((state) => state.selectEar);
  const orderEars = useBath((state) => state.orderEars);
  const [drag, setDrag] = useState<number | null>(null);

  function move(from: number, to: number, dragging = false) {
    if (to < 0 || to >= ears.length || from === to) return;
    const ids = ears.map((item) => item.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id!);
    orderEars(ids);
    if (dragging) setDrag(to);
  }

  return (
    <InfoPoint hint="The first row is the ear you hear. Drag a row, or use the arrows, to set the order Cycle through follows. The rest are recording stems.">
      <ol className="grid gap-1" aria-label="Ear and stem order" data-guide="cycle">
      {ears.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDrag(index)}
          onDragOver={(event) => {
            event.preventDefault();
            if (drag === null || drag === index) return;
            move(drag, index, true);
          }}
          onDragEnd={() => setDrag(null)}
          className={cn(
            "flex items-center gap-1 rounded-md border pr-1",
            item.id === activeEarId ? "border-gold" : "border-line",
            drag === index ? "bg-surface-2" : "",
          )}
        >
          <span className="grid size-11 shrink-0 cursor-grab place-items-center text-muted" aria-hidden>
            <GripVertical className="size-4" />
          </span>
          <button type="button" className="h-11 min-w-0 flex-1 text-left text-sm text-fg" onClick={() => selectEar(item.id)}>
            {index === 0 ? "Ear" : `Stem ${index}`}
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md text-fg disabled:opacity-30"
            aria-label={`Move ${index === 0 ? "ear" : `stem ${index}`} earlier`}
            disabled={index === 0}
            onClick={() => move(index, index - 1)}
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md text-fg disabled:opacity-30"
            aria-label={`Move ${index === 0 ? "ear" : `stem ${index}`} later`}
            disabled={index === ears.length - 1}
            onClick={() => move(index, index + 1)}
          >
            <ChevronDown className="size-4" />
          </button>
        </li>
      ))}
      </ol>
    </InfoPoint>
  );
}

function formatCycle(seconds: number): string {
  const rounded = Math.round(seconds * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(2)}s`;
}

function CycleThrough() {
  const cycleThrough = useBath((state) => state.cycleThrough);
  const cycleSeconds = useBath((state) => state.cycleSeconds);
  const setCycle = useBath((state) => state.setCycle);
  return (
    <div className="grid gap-3" data-guide="cycle">
      <InfoPoint hint="When this is on, you hear one stem at a time. After Turn every, it fades quickly into the next stem in the list, with no gap, and loops. You do not hear the other stems at the same time. Add a stem first.">
        <label className="flex items-center gap-3 text-sm text-fg">
          <input
            type="checkbox"
            className="size-5 accent-[#d7b56d]"
            checked={cycleThrough}
            onChange={(event) => setCycle({ on: event.target.checked })}
          />
          Cycle through
          <span className="text-xs font-medium text-gold">New!</span>
        </label>
      </InfoPoint>
      {cycleThrough ? (
        <Slider
          label="Turn every"
          guideId="cycle"
          hint="How long you hear this stem before it fades to the next. The fade is short, so there is no silence, and only the stem you are on is in the mix."
          min={0.25}
          max={33.33}
          step={0.01}
          value={cycleSeconds}
          display={formatCycle(cycleSeconds)}
          onChange={(value) => setCycle({ seconds: value })}
        />
      ) : null}
    </div>
  );
}

function EarInspector() {
  const ears = useBath((state) => state.ears);
  const activeEarId = useBath((state) => state.activeEarId);
  const addEar = useBath((state) => state.addEar);
  const removeEar = useBath((state) => state.removeEar);
  const moveReceiver = useBath((state) => state.moveReceiver);
  const turnReceiver = useBath((state) => state.turnReceiver);
  const tiltReceiver = useBath((state) => state.tiltReceiver);
  const handoff = useBath((state) => state.handoff);
  const previewEarId = useBath((state) => state.previewEarId);
  const promoteEar = useBath((state) => state.promoteEar);
  const makeStem = useBath((state) => state.makeStem);
  const ear = ears.find((item) => item.id === activeEarId) ?? ears[0];
  if (!ear) return null;
  const index = Math.max(0, ears.findIndex((item) => item.id === ear.id));
  const primary = index === 0;
  const title = primary ? "Ear 1" : `Stem ${index}`;
  const facing = Math.round((((ear.yaw * 180) / Math.PI) % 360 + 360) % 360);
  return (
    <div className="grid gap-4">
      <InfoBox
        title={title}
        body={
          primary
            ? "The first row is the ear you hear. Drag the list, or the arrows, to set the order. Cycle through plays one stem at a time, then a short fade into the next, and loops. You do not hear the others at once. A corner of the box turns the ear. An edge sizes both cones. Cones and the box stay above the floor."
            : "A recording stem. You hear the first row until Cycle through reaches this one, or you press the ear icon. The handoff is a short mix, so it does not click. This cone cannot pass through the floor, a wall, or a bowl."
        }
      />
      <EarOrder />
      <CycleThrough />
      <div className="flex gap-2">
        <button
          type="button"
          className="h-11 flex-1 rounded-md border border-line text-sm text-fg disabled:opacity-40"
          onClick={() => addEar()}
          disabled={ears.length >= MAX_EARS}
        >
          Add stem
        </button>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-md border border-line text-fg disabled:opacity-40"
          onClick={() => removeEar(ear.id)}
          disabled={ears.length <= 1}
          aria-label="Remove ear"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {primary ? (
        <button
          type="button"
          data-role-toggle="stem"
          aria-pressed={handoff}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border border-gold px-3 text-sm ${handoff ? "bg-gold text-bg" : "text-gold"}`}
          onClick={() => makeStem()}
        >
          <GitBranch className="size-4" />
          {handoff ? "Cancel stem" : "Turn into a stem"}
          <span className="text-xs font-medium">New!</span>
        </button>
      ) : (
        <button
          type="button"
          data-role-toggle="ear"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-gold bg-gold px-3 text-sm text-bg"
          onClick={() => promoteEar(ear.id)}
        >
          <Ear className="size-4" />
          {previewEarId === ear.id ? "Keep as the ear" : "Make this the ear"}
          <span className="text-xs font-medium">New!</span>
        </button>
      )}
      {primary && handoff ? (
        <p className="text-pretty text-xs text-muted">Select another ear. You'll hear it as a preview, mixed with this one. Then press the ear icon to keep it.</p>
      ) : previewEarId === ear.id ? (
        <p className="text-pretty text-xs text-muted">Previewing this stem as the ear you hear. The two are mixing. Keep it, or select another stem.</p>
      ) : null}
      <Slider
        label="Ear height"
        hint="How high this ear sits. 1× is the old ceiling. Drag the head up to 4× that height. The head, the cones, and the selection box stay above the floor."
        min={0}
        max={400}
        step={1}
        value={Math.round(ear.height * 100)}
        display={ear.height > 1.02 ? `${ear.height.toFixed(1)}×` : ear.height < 0.34 ? "Low" : ear.height > 0.72 ? "High" : "Seated"}
        onChange={(value) => moveReceiver(ear.x, ear.y, value / 100, ear.id)}
      />
      <Slider
        label="Facing"
        hint="Which way this ear looks. The ring above the head turns both horns together. The ring around one horn turns only that horn. Left and right on the keyboard turn the view with the ear."
        min={0}
        max={360}
        step={1}
        value={facing}
        display={`${facing}°`}
        onChange={(value) => turnReceiver((value / 180) * Math.PI, ear.id)}
      />
      <Slider
        label="Tilt down"
        fresh
        hint="How far the head looks down. Pull the ball past a mouth to aim that horn: up follows your hand up, down follows it down. The red ball inside a horn only changes that cone's size. The ball on the back of a horn lifts that horn. The lever behind the head lifts both."
        min={0}
        max={75}
        step={1}
        value={Math.round((earPitch(ear) * 180) / Math.PI)}
        display={`${Math.round((earPitch(ear) * 180) / Math.PI)}°`}
        onChange={(value) => tiltReceiver((value * Math.PI) / 180, ear.id)}
      />
      <ChannelSliders earId={ear.id} side="left" channel={ear.left} title="Left cone" />
      <ChannelSliders earId={ear.id} side="right" channel={ear.right} title="Right cone" />
    </div>
  );
}

function BowlInspector() {
  const bowls = useBath((state) => state.bowls);
  const selectedId = useBath((state) => state.selectedId);
  const updateBowl = useBath((state) => state.updateBowl);
  const removeBowl = useBath((state) => state.removeBowl);
  const selection = useBath((state) => state.selection);
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
      <InfoBox
        title={pitch.note}
        body={`${glass.label}. ${glass.description} Drag a top corner to resize. The bowl stops before it enters another bowl or an ear. Drag a bottom point down to make the bowl taller — the rim stays, and the box stops at the floor. On the floor those points are hidden. Shift-click to select more, then move or scale them together. Command-Z steps back. Resizing glass does not resize the room.${selection.length > 1 ? ` ${selection.length} selected.` : ""}`}
      />
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
      </label>
      <Slider
        label="Frequency"
        guideId="frequency"
        hint="The pitch of this bowl. Wider glass does not change it."
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
        label="Width"
        guideId="width"
        hint="Diameter. Drag a corner of the box in the room to do the same. Wider glass is warmer and carries farther. It stops before it would pass through another bowl or an ear. Pitch stays where you set it."
        min={36}
        max={100}
        step={1}
        value={Math.round(bowl.size * 100)}
        display={`${Math.round(bowl.size * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { size: value / 100 })}
      />
      <Slider
        label="Height"
        guideId="height"
        hint="Wall height. Drag a bottom point of the box down to grow it. The box and the handles stop at the floor, so the outline never hangs through the surface. A taller cup leans on the fundamental. Level is what raises the bowl."
        min={22}
        max={100}
        step={1}
        value={Math.round(bowl.height * 100)}
        display={`${Math.round(bowl.height * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { height: value / 100 })}
      />
      <Slider
        label="Level"
        guideId="frequency"
        hint="How high the bowl sits on its stand, and how loud it is. Drag the stand in the room to raise it. The glass and its box stay above the floor, and they stop on another bowl or an ear."
        min={5}
        max={100}
        step={1}
        value={Math.round(bowl.gain * 100)}
        display={`${Math.round(bowl.gain * 100)}`}
        onChange={(value) => updateBowl(bowl.id, { gain: value / 100 })}
      />
      <Slider
        label="Rim"
        guideId="frequency"
        hint="How much the rim sings above the fundamental."
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

function DomeInspector() {
  const domes = useBath((state) => state.domes);
  const settings = useBath((state) => state.settings);
  const selectedId = useBath((state) => state.selectedId);
  const updateDome = useBath((state) => state.updateDome);
  const removeDome = useBath((state) => state.removeDome);
  const addDome = useBath((state) => state.addDome);
  const dome = domes.find((item) => item.id === selectedId) ?? domes[0];
  const [hzText, setHzText] = useState("");
  const [hzFocused, setHzFocused] = useState(false);

  useEffect(() => {
    if (!hzFocused && dome) setHzText(dome.frequency.toFixed(2));
  }, [dome, hzFocused]);

  if (!dome) {
    return (
      <div className="grid gap-3">
        <InfoBox
          title="Face down"
          body="A dome hangs over the glass with its opening toward the floor. Waves that rise into it come back down. Hang one, then scale it, lift it, and choose what it is made of."
        />
        <button type="button" className="h-11 rounded-md bg-gold text-sm font-medium text-bg" onClick={addDome}>
          Hang a dome
        </button>
      </div>
    );
  }

  const pitch = describePitch(dome.frequency);
  const glass = GLASS[dome.glass];
  const rim = domePoint(dome, settings).y;

  return (
    <div className="grid gap-4">
      <InfoBox
        title="Face down"
        body={`${glass.label}. The opening faces the floor, so waves that rise into it return. Drag the crown to change the height, the point on the rim to scale it, and the shell to slide it. The icons on the dome remove or copy it. Material, pitch, reflection, spread, and brightness change the return.`}
      />
      <label className="grid gap-1 text-sm text-muted">
        Material
        <select
          className="h-11 rounded-md border border-line bg-surface-2 px-3 text-fg"
          value={dome.glass}
          onChange={(event) => updateDome(dome.id, { glass: event.target.value as typeof dome.glass })}
        >
          {GLASS_IDS.map((id) => (
            <option key={id} value={id}>
              {GLASS[id].label}
            </option>
          ))}
        </select>
      </label>
      <Slider
        label="Frequency"
        hint="The note this shell likes to send back. A rising wave close to this pitch returns louder."
        min={0}
        max={1000}
        step={1}
        value={Math.round(hzToUnit(dome.frequency) * 1000)}
        display={`${pitch.hzLabel} Hz`}
        onChange={(unit) => updateDome(dome.id, { frequency: unitToHz(unit / 1000) })}
      />
      <label className="grid gap-1 text-sm text-muted">
        Exact hertz
        <input
          className="h-11 rounded-md border border-line bg-surface-2 px-3 tabular-nums text-fg"
          inputMode="decimal"
          value={hzFocused ? hzText : dome.frequency.toFixed(2)}
          onFocus={() => {
            setHzFocused(true);
            setHzText(dome.frequency.toFixed(2));
          }}
          onChange={(event) => setHzText(event.target.value)}
          onBlur={() => {
            setHzFocused(false);
            const next = Number(hzText);
            if (Number.isFinite(next)) updateDome(dome.id, { frequency: next });
          }}
        />
      </label>
      <Slider
        label="Scale"
        hint={`How wide the opening is. The top of the slider matches the hall, ${HALL_DIAMETER.toFixed(1)} m across. A wider dome catches more of the waves rising from the bowls. From outside the shell it stays nearly clear so you can still see the room.`}
        min={Math.round(DOME_SIZE_MIN * 100)}
        max={Math.round(DOME_SIZE_MAX * 100)}
        step={1}
        value={Math.round(dome.size * 100)}
        display={`${(domePoint(dome, settings).radius * 2).toFixed(1)} m`}
        onChange={(value) => updateDome(dome.id, { size: value / 100 })}
      />
      <Slider
        label="Height"
        hint="How high the rim sits. Higher sends the bounce back later. Drag the crown to do the same. The shell stays face-down."
        min={Math.round(DOME_HEIGHT_MIN * 100)}
        max={Math.round(DOME_HEIGHT_MAX * 100)}
        step={1}
        value={Math.round(dome.height * 100)}
        display={`${rim.toFixed(2)} m`}
        onChange={(value) => updateDome(dome.id, { height: value / 100 })}
      />
      <Slider
        label="Reflection"
        hint="How much of a rising wave is sent back down. Low values let the wave pass. High values throw it back into the room."
        min={0}
        max={100}
        step={1}
        value={Math.round(dome.reflect * 100)}
        display={`${Math.round(dome.reflect * 100)}`}
        onChange={(value) => updateDome(dome.id, { reflect: value / 100 })}
      />
      <Slider
        label="Spread"
        hint="How tightly the return focuses. Low keeps a clear image. High scatters the bounce so it arrives softer and wider."
        min={0}
        max={100}
        step={1}
        value={Math.round(dome.diffuse * 100)}
        display={`${Math.round(dome.diffuse * 100)}`}
        onChange={(value) => updateDome(dome.id, { diffuse: value / 100 })}
      />
      <Slider
        label="Brightness"
        hint="How much of the high end the shell keeps. Dark materials dull the return. Bright ones leave the air in it."
        min={0}
        max={100}
        step={1}
        value={Math.round(dome.brightness * 100)}
        display={`${Math.round(dome.brightness * 100)}`}
        onChange={(value) => updateDome(dome.id, { brightness: value / 100 })}
      />
      <button
        type="button"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm text-fg"
        onClick={() => removeDome(dome.id)}
      >
        <Trash2 className="size-4" />
        Remove dome
      </button>
    </div>
  );
}
