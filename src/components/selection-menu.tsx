import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Ear, GitBranch, X } from "lucide-react";
import { projectChamber } from "@/components/chamber";
import { useBath } from "@/stores/bath";

type Point = { x: number; y: number; below: boolean };

const chip =
  "grid size-12 place-items-center rounded-full shadow-lg shadow-black/70";

export function SelectionMenu({ onPick, quiet = false }: { stage?: HTMLElement | null; onPick: () => void; quiet?: boolean }) {
  const focus = useBath((state) => state.focus);
  const selectedId = useBath((state) => state.selectedId);
  const activeEarId = useBath((state) => state.activeEarId);
  const ears = useBath((state) => state.ears);
  const handoff = useBath((state) => state.handoff);
  const previewEarId = useBath((state) => state.previewEarId);
  const duplicateBowl = useBath((state) => state.duplicateBowl);
  const duplicateEar = useBath((state) => state.duplicateEar);
  const duplicateDome = useBath((state) => state.duplicateDome);
  const removeBowl = useBath((state) => state.removeBowl);
  const removeEar = useBath((state) => state.removeEar);
  const removeDome = useBath((state) => state.removeDome);
  const promoteEar = useBath((state) => state.promoteEar);
  const makeStem = useBath((state) => state.makeStem);
  const [point, setPoint] = useState<Point | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const projected = projectChamber();
      const state = useBath.getState();
      let next: Point | null = null;
      const hit =
        state.focus === "bowl" && state.selectedId
          ? projected.bowls.find((bowl) => bowl.id === state.selectedId)
          : state.focus === "dome" && state.selectedId
            ? projected.domes.find((dome) => dome.id === state.selectedId)
            : state.focus === "ear"
              ? (projected.ears.find((ear) => ear.id === state.activeEarId) ?? projected.ear)
              : null;
      if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
        const x = Math.min(window.innerWidth - 28, Math.max(28, hit.x));
        const below = hit.y < 88;
        next = { x, y: below ? hit.y + 22 : hit.y - 14, below };
      }
      setPoint((current) => {
        if (!next && !current) return current;
        if (next && current && next.below === current.below && Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5) return current;
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [focus, selectedId, activeEarId]);

  if (quiet || !point || typeof document === "undefined") return null;
  const id = focus === "ear" ? activeEarId : selectedId;
  if (!id) return null;
  const primary = focus === "ear" && ears[0]?.id === id;
  const confirming = focus === "ear" && !primary && (handoff || previewEarId === id);

  return createPortal(
    <div
      className="pointer-events-auto fixed z-50 flex items-center gap-1.5 rounded-full border border-gold bg-[#102028]/95 p-1.5 shadow-xl"
      style={{ left: point.x, top: point.y, transform: point.below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}
      data-selection-menu={focus}
      data-handoff={handoff ? "on" : "off"}
    >
      {focus === "ear" ? (
        <button
          type="button"
          data-role-toggle={primary ? "stem" : "ear"}
          title={primary ? (handoff ? "Cancel" : "Turn into a stem") : "Make this the ear"}
          aria-pressed={primary ? handoff : confirming}
          className={`${chip} border border-gold ${confirming || (primary && handoff) ? "bg-gold text-bg" : "bg-[#102028] text-gold"}`}
          aria-label={
            primary
              ? handoff
                ? "Cancel turning this ear into a stem"
                : "Turn this ear into a stem"
              : handoff
                ? "Keep this as the ear you hear"
                : "Make this the ear you hear"
          }
          onClick={() => {
            if (primary) makeStem();
            else promoteEar(id);
            onPick();
          }}
        >
          {primary ? <GitBranch className="size-5" /> : <Ear className="size-5" />}
        </button>
      ) : null}
      <button
        type="button"
        title={focus === "ear" ? "Remove ear" : focus === "dome" ? "Remove dome" : "Remove bowl"}
        className={`${chip} border border-white/40 bg-[#102028] text-white`}
        aria-label={focus === "ear" ? "Remove ear" : focus === "dome" ? "Remove dome" : "Remove bowl"}
        onClick={() => {
          if (focus === "ear") removeEar(id);
          else if (focus === "dome") removeDome(id);
          else removeBowl(id);
          onPick();
        }}
      >
        <X className="size-5" />
      </button>
      <button
        type="button"
        title={focus === "ear" ? "Duplicate ear" : focus === "dome" ? "Duplicate dome" : "Duplicate bowl"}
        className={`${chip} bg-gold text-bg`}
        aria-label={focus === "ear" ? "Duplicate ear" : focus === "dome" ? "Duplicate dome" : "Duplicate bowl"}
        onClick={() => {
          if (focus === "ear") duplicateEar(id);
          else if (focus === "dome") duplicateDome(id);
          else duplicateBowl(id);
          onPick();
        }}
      >
        <Copy className="size-5" />
      </button>
    </div>,
    document.body,
  );
}