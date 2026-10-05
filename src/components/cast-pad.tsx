import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Ear, GitBranch } from "lucide-react";
import { GONGS, isGong, type GongId } from "@/lib/audio/gong";
import { GLASS } from "@/lib/audio/glass";
import { shortNote } from "@/lib/audio/notes";
import type { GlassId } from "@/lib/audio/types";
import { castBus } from "@/lib/cast/protocol";
import { useBath } from "@/stores/bath";

const TINT: Record<GlassId, string> = {
  quartz: "#7dd3fc",
  frosted: "#dbeafe",
  gold: "#f5b942",
  platinum: "#e2e8f0",
  rose: "#fb7185",
  obsidian: "#8b5cf6",
  aqua: "#2dd4bf",
  emerald: "#34d399",
  phantom: "#d8b4fe",
  selenite: "#fbbf24",
};

function sendTouch(bowlId: string, mode: "rim" | "gong" | "rim-off", extra?: { amount?: number; mallet?: GongId }) {
  castBus.send?.({ kind: "touch", bowlId, mode, ...extra }, mode !== "rim");
}

export function CastPad() {
  const bowls = useBath((state) => state.bowls);
  const ears = useBath((state) => state.ears);
  const selectedId = useBath((state) => state.selectedId);
  const activeEarId = useBath((state) => state.activeEarId);
  const focus = useBath((state) => state.focus);
  const select = useBath((state) => state.select);
  const selectEar = useBath((state) => state.selectEar);
  const promoteEar = useBath((state) => state.promoteEar);
  const makeStem = useBath((state) => state.makeStem);
  const updateBowl = useBath((state) => state.updateBowl);
  const bowl = bowls.find((item) => item.id === selectedId) ?? null;
  const ear = ears.find((item) => item.id === activeEarId) ?? ears[0];
  const earIndex = ear ? Math.max(0, ears.findIndex((item) => item.id === ear.id)) : 0;
  const [mallet, setMallet] = useState<GongId>(isGong(bowl?.gong) ? bowl.gong : "felt");
  const [saved, setSaved] = useState<string | null>(null);
  const [bead, setBead] = useState<{ x: number; y: number } | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ moved: false, held: false, seen: false, angle: 0, timer: 0, x: 0, y: 0 });
  const bowlId = bowl?.id ?? "";

  useEffect(() => {
    const current = useBath.getState().bowls.find((item) => item.id === bowlId);
    setMallet(isGong(current?.gong) ? current.gong : "felt");
    setSaved(null);
  }, [bowlId]);

  const chosenMallet = bowl && isGong(bowl.gong) ? bowl.gong : mallet;

  function pickBowl(id: string) {
    const next = bowls.find((item) => item.id === id);
    setMallet(isGong(next?.gong) ? next.gong : "felt");
    setSaved(null);
    select(id);
  }

  function onPadDown(event: PointerEvent<HTMLDivElement>) {
    if (!bowl) return;
    const node = padRef.current;
    if (!node) return;
    node.setPointerCapture(event.pointerId);
    gesture.current = { moved: false, held: false, seen: false, angle: 0, timer: 0, x: event.clientX, y: event.clientY };
    window.clearTimeout(gesture.current.timer);
    const id = bowl.id;
    const keep = chosenMallet;
    gesture.current.timer = window.setTimeout(() => {
      gesture.current.held = true;
      updateBowl(id, { gong: keep });
      setSaved(GONGS.find((item) => item.id === keep)?.label ?? "Mallet");
      sendTouch(id, "rim-off");
    }, 560);
  }

  function onPadMove(event: PointerEvent<HTMLDivElement>) {
    if (!bowl || !padRef.current) return;
    const box = padRef.current.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const reach = Math.hypot(dx, dy);
    const radius = box.width / 2;
    if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 14) {
      gesture.current.moved = true;
      window.clearTimeout(gesture.current.timer);
    }
    if (reach < radius * 0.28 || reach > radius * 1.05) return;
    const angle = Math.atan2(dy, dx);
    if (!gesture.current.seen) {
      gesture.current.seen = true;
      gesture.current.angle = angle;
      return;
    }
    let turn = angle - gesture.current.angle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    gesture.current.angle = angle;
    const speed = Math.min(1, Math.abs(turn) / 0.18);
    if (speed > 0.04) {
      gesture.current.moved = true;
      window.clearTimeout(gesture.current.timer);
      sendTouch(bowl.id, "rim", { amount: 0.25 + speed * 0.75 });
    }
    setBead({ x: 50 + (dx / radius) * 42, y: 50 + (dy / radius) * 42 });
  }

  function onPadUp() {
    window.clearTimeout(gesture.current.timer);
    if (!bowl) return;
    if (!gesture.current.held && !gesture.current.moved) sendTouch(bowl.id, "gong", { mallet: chosenMallet });
    else sendTouch(bowl.id, "rim-off");
    setBead(null);
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg/95 text-fg" data-cast-pad="open">
      <div className="px-4 pt-4">
        <p className="text-xs tracking-wide text-muted uppercase">Paired</p>
        <h2 className="font-display text-3xl leading-none">Play the screen</h2>
        <p className="mt-1 text-sm text-muted">Choose a bowl, the ear, or a stem. The larger screen is what you hear.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {bowls.map((item) => {
          const tint = TINT[item.glass];
          const on = focus === "bowl" && item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-2 ${on ? "border-gold" : "border-line"}`}
              onClick={() => pickBowl(item.id)}
              aria-pressed={on}
            >
              <span className="grid size-11 place-items-center rounded-full" style={{ background: tint, color: "#14221c" }} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <ellipse cx="12" cy="8" rx="7" ry="3" />
                  <path d="M5 8c0 6 3.2 10 7 10s7-4 7-10" />
                </svg>
              </span>
              <span className="text-sm">{shortNote(item.frequency)}</span>
              <span className="max-w-full truncate text-[10px] text-muted">{GLASS[item.glass].label}</span>
            </button>
          );
        })}
        {ears.map((item, index) => {
          const on = focus === "ear" && item.id === (ear?.id ?? "");
          const primary = index === 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-2 ${on ? "border-gold" : "border-line"}`}
              onClick={() => selectEar(item.id)}
              aria-pressed={on}
            >
              <span
                className="grid size-11 place-items-center rounded-full"
                style={{ background: primary ? "#e6c27a" : "#9a7b45", color: "#14221c" }}
                aria-hidden="true"
              >
                {primary ? <Ear className="size-5" /> : <GitBranch className="size-5" />}
              </span>
              <span className="text-sm">{primary ? "Ear" : `Stem ${index}`}</span>
              <span className="text-[10px] text-muted">{primary ? "You hear this" : "Recording"}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {focus === "bowl" && bowl ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted">
              Slide around the rim and the paired screen sings. Tap the bowl to strike it. Hold to keep the mallet on this bowl.
            </p>
            <div
              ref={padRef}
              className="relative mx-auto aspect-square w-full max-w-xs touch-none rounded-full"
              style={{
                background: `radial-gradient(circle at 50% 42%, transparent 34%, ${TINT[bowl.glass]}55 36%, ${TINT[bowl.glass]} 68%, transparent 70%)`,
                boxShadow: `inset 0 0 0 2px ${TINT[bowl.glass]}`,
              }}
              onPointerDown={onPadDown}
              onPointerMove={onPadMove}
              onPointerUp={onPadUp}
              onPointerCancel={onPadUp}
            >
              {bead ? (
                <span
                  className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg"
                  style={{ left: `${bead.x}%`, top: `${bead.y}%`, background: TINT[bowl.glass] }}
                />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-sm text-fg/80">Rim · tap to gong</span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {GONGS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-md border px-1 py-2 text-xs ${chosenMallet === item.id ? "border-gold text-gold" : "border-line text-muted"}`}
                  onClick={() => {
                    setMallet(item.id);
                    setSaved(null);
                  }}
                  aria-pressed={chosenMallet === item.id}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{GONGS.find((item) => item.id === chosenMallet)?.blurb} Hold the bowl to save it for this session.</p>
            {saved ? <p className="text-sm text-gold">{saved} is saved on this bowl. It stays when you save the template.</p> : null}
          </div>
        ) : ear ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted">
              {earIndex === 0
                ? "The larger screen hears this ear. The stems are the other recordings."
                : `Stem ${earIndex} is a recording. You can preview it, or make it the ear the screen hears.`}
            </p>
            {earIndex === 0 ? (
              <button type="button" className="h-11 rounded-md border border-line text-sm" onClick={() => makeStem()}>
                Turn this into a stem
              </button>
            ) : (
              <>
                <button type="button" className="h-11 rounded-md bg-gold text-sm font-medium text-bg" onClick={() => promoteEar(ear.id)}>
                  Hear this on the screen
                </button>
                <button
                  type="button"
                  className="h-11 rounded-md border border-line text-sm"
                  onClick={() => {
                    makeStem();
                    selectEar(ear.id);
                  }}
                >
                  Preview the mix
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
