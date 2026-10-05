import { InfoBox, InfoPoint, Slider, Toggle } from "@/components/controls";
import { GUIDE, useGuide } from "@/components/guide";
import { bathEngine } from "@/lib/audio/engine";
import { periodRange } from "@/lib/audio/notes";
import { FRESH_SHAPES, getRoom, ROOM_EFFECTS, ROOMS } from "@/lib/audio/rooms";
import { minRoomSize } from "@/lib/audio/space";
import type { LoopMode } from "@/lib/audio/types";
import { cn } from "@/lib/cn";
import { useBath } from "@/stores/bath";

const MODES: { id: LoopMode; label: string; copy: string }[] = [
  { id: "continuous", label: "Sustain", copy: "Endless ring. The default loop." },
  { id: "breath", label: "Breath", copy: "The whole bath swells and eases together." },
  { id: "tide", label: "Tide", copy: "A long rise and a shorter fall, then again." },
  { id: "mallet", label: "Mallet", copy: "Soft strikes, staggered, then the cycle repeats." },
  { id: "canon", label: "Canon", copy: "Bowls enter one after another, hold, and release." },
];

export function SessionPanel() {
  const settings = useBath((state) => state.settings);
  const bowls = useBath((state) => state.bowls);
  const setSettings = useBath((state) => state.setSettings);
  const setRoom = useBath((state) => state.setRoom);
  const room = getRoom(settings.roomShape);
  const minSize = minRoomSize(settings, bowls);
  const range = periodRange(settings.loopMode);
  const modeCopy = MODES.find((mode) => mode.id === settings.loopMode)?.copy;
  const guideOpen = useGuide((state) => state.open);
  const guideStep = useGuide((state) => state.step);
  const highlight = GUIDE[guideStep]?.highlight;
  const shapesActive = guideOpen && highlight === "shapes";

  return (
    <div className="grid gap-6">
      <InfoBox
        title={room.label}
        body={`${room.blurb} ${modeCopy ?? "Sustain holds."} The i beside each slider explains it. Bowls stop at other bowls and at ears. Cones and boxes stay above the floor. Resizing a bowl or a cone does not change the room. Shift-click selects several. Command-Z steps back. Leave the screen alone and the menus fade, then only the bowls spin, then only the waveforms remain.`}
      />
      <section className={cn("grid gap-3 rounded-md", shapesActive && "ring-1 ring-gold")} data-guide="shapes">
        <InfoPoint hint={room.blurb}>
          <h2 className="font-display text-2xl text-fg">Shape</h2>
        </InfoPoint>
        <div className="grid grid-cols-2 gap-2">
          {ROOMS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-shape={item.id}
              aria-pressed={settings.roomShape === item.id}
              className={cn(
                "min-h-11 rounded-md border px-2 py-2 text-sm",
                settings.roomShape === item.id ? "border-gold text-gold" : "border-line text-fg",
              )}
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

      <section className="grid gap-3" data-guide="phrase">
        <InfoPoint hint={modeCopy ?? "Endless ring. The bath does not rise or fall."}>
          <h2 className="font-display text-2xl text-fg">Phrase</h2>
        </InfoPoint>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={cn(
                "h-11 rounded-md border text-sm",
                settings.loopMode === mode.id ? "border-gold text-gold" : "border-line text-fg",
              )}
              onClick={() => setSettings({ loopMode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
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
            guideId="phrase"
            hint="How long one pass of this phrase lasts before it begins again."
            min={range[0]}
            max={range[1]}
            step={1}
            value={settings.period}
            display={`${Math.round(settings.period)} s`}
            onChange={(period) => setSettings({ period })}
          />
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-fg">Interference</h2>
        <Slider
          label="Veil"
          guideId="veil"
          hint="A quiet twin on every bowl. Each one is detuned slightly differently, so the beats do not lock."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.veil * 100)}
          display={`${Math.round(settings.veil * 100)}`}
          onChange={(value) => setSettings({ veil: value / 100 })}
        />
        <Slider
          label="Veil beat"
          guideId="veil"
          hint="How fast that quiet twin beats against the bowl. Lower is a slow throb."
          min={15}
          max={180}
          step={1}
          value={Math.round(settings.veilHz * 100)}
          display={`${settings.veilHz.toFixed(2)} Hz`}
          onChange={(value) => setSettings({ veilHz: value / 100 })}
        />
        <Slider
          label="Crown shimmer"
          guideId="veil"
          hint="A high, thin layer on the glass. More of it brightens the crown of the sound."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.shimmer * 100)}
          display={`${Math.round(settings.shimmer * 100)}`}
          onChange={(value) => setSettings({ shimmer: value / 100 })}
        />
        <Slider
          label="Room width"
          guideId="room-size"
          hint="Spreads the floor left to right. You can drag bowls and ears into the extra width. They still stop at the walls and at each other."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.width * 100)}
          display={`${Math.round(settings.width * 100)}`}
          onChange={(value) => setSettings({ width: value / 100 })}
        />
        <Slider
          label="Room depth"
          guideId="room-size"
          hint="Spreads the floor forward and back. Drag into the new depth the same way. Nothing is allowed through the floor or through another object."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.depth * 100)}
          display={`${Math.round(settings.depth * 100)}`}
          onChange={(value) => setSettings({ depth: value / 100 })}
        />
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
              guideId="veil"
              hint="The note the quiet bed sits on."
              min={70}
              max={220}
              step={1}
              value={settings.binauralCarrier}
              display={`${Math.round(settings.binauralCarrier)} Hz`}
              onChange={(binauralCarrier) => setSettings({ binauralCarrier })}
            />
            <Slider
              label="Bed beat"
              guideId="veil"
              hint="How far apart the left and right bed tones are. That difference is the beat you feel."
              min={2}
              max={80}
              step={1}
              value={Math.round(settings.binauralBeat * 10)}
              display={`${settings.binauralBeat.toFixed(1)} Hz`}
              onChange={(value) => setSettings({ binauralBeat: value / 10 })}
            />
            <Slider
              label="Bed level"
              guideId="veil"
              hint="How loud the bed is against the bowls."
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
          guideId="hall"
          hint="How much of the soft hall sits behind the dry crystal. The glass itself stays full."
          min={0}
          max={80}
          step={1}
          value={Math.round(settings.wet * 100)}
          display={`${Math.round(settings.wet * 100)}`}
          onChange={(value) => setSettings({ wet: value / 100 })}
        />
        <Slider
          label="Hall size"
          guideId="hall"
          hint="How large that hall feels, apart from the room you are standing in."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.hall * 100)}
          display={`${Math.round(settings.hall * 100)}`}
          onChange={(value) => setSettings({ hall: value / 100 })}
        />
        <Slider
          label="Silk"
          guideId="hall"
          hint="Trims the top if a small bowl glares."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.air * 100)}
          display={`${Math.round(settings.air * 100)}`}
          onChange={(value) => setSettings({ air: value / 100 })}
        />
        <Slider
          label="Transpose"
          guideId="hall"
          hint="Shifts every bowl by cents. 100 cents is one semitone."
          min={-100}
          max={100}
          step={1}
          value={settings.transpose}
          display={`${settings.transpose > 0 ? "+" : ""}${settings.transpose} cents`}
          onChange={(transpose) => setSettings({ transpose })}
        />
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-fg">How the room colors the sound</h2>
        {ROOM_EFFECTS.map((effect) => (
          <Slider
            key={effect.key}
            label={effect.label}
            guideId={effect.key}
            hint={effect.hint}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings[effect.key] * 100)}
            display={`${Math.round(settings[effect.key] * 100)}`}
            onChange={(value) => setSettings({ [effect.key]: value / 100 })}
          />
        ))}
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
          guideId="volume"
          hint="How loud the bath is. The header slider is the same control."
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.volume * 100)}
          display={`${Math.round(settings.volume * 100)}`}
          onChange={(value) => setSettings({ volume: value / 100 })}
        />
      </section>
    </div>
  );
}
