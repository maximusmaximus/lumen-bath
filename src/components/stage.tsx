import { useEffect, useRef, type PointerEvent } from "react";
import { Plus } from "lucide-react";
import { bathEngine } from "@/lib/audio/engine";
import { shortNote } from "@/lib/audio/notes";
import { GLASS } from "@/lib/audio/glass";
import { MAX_BOWLS } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

export function Stage({ onPick }: { onPick: () => void }) {
  const bowls = useBath((state) => state.bowls);
  const selectedId = useBath((state) => state.selectedId);
  const playing = useBath((state) => state.playing);
  const select = useBath((state) => state.select);
  const move = useBath((state) => state.move);
  const addBowl = useBath((state) => state.addBowl);
  const floorRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const energy = playing ? bathEngine.readEnergy() : 0;
      glowRef.current?.style.setProperty("--energy", energy.toFixed(3));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function place(id: string, event: PointerEvent) {
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    move(id, x, y);
  }

  return (
    <div
      ref={floorRef}
      className="floor absolute inset-0"
      data-live={playing ? "true" : "false"}
    >
      <div ref={glowRef} className="floor-glow pointer-events-none absolute inset-0" />
      <div className="floor-vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/50" />
      {bowls.map((bowl) => {
        const selected = bowl.id === selectedId;
        return (
          <div
            key={bowl.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${shortNote(bowl.frequency)}, ${GLASS[bowl.glass].label}, ${bowl.muted ? "muted" : "sounding"}`}
            data-glass={bowl.glass}
            data-selected={selected ? "true" : "false"}
            className="bowl"
            style={{
              left: `${bowl.x * 100}%`,
              top: `${bowl.y * 100}%`,
              ["--span" as string]: bowl.size.toFixed(3),
              ["--spin" as string]: `${(18 - bowl.sing * 10).toFixed(1)}s`,
              opacity: bowl.muted ? 0.45 : 1,
              zIndex: selected ? 5 : 2,
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragId.current = bowl.id;
              select(bowl.id);
              onPick();
            }}
            onPointerMove={(event) => {
              if (dragId.current !== bowl.id) return;
              place(bowl.id, event);
            }}
            onPointerUp={() => {
              dragId.current = null;
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.04 : 0.015;
              if (event.key === "ArrowLeft") move(bowl.id, bowl.x - step, bowl.y);
              if (event.key === "ArrowRight") move(bowl.id, bowl.x + step, bowl.y);
              if (event.key === "ArrowUp") move(bowl.id, bowl.x, bowl.y - step);
              if (event.key === "ArrowDown") move(bowl.id, bowl.x, bowl.y + step);
              if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                select(bowl.id);
              }
            }}
          >
            <span className="bowl-orbit" />
            <span className="bowl-shine" />
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="bowl-note text-fg">{shortNote(bowl.frequency)}</span>
            </span>
          </div>
        );
      })}
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
        Drag a bowl to place it in the room
      </p>
    </div>
  );
}
