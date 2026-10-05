import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";
import { GUIDE, useGuide } from "@/components/guide";

export function InfoBox({ title, body }: { title: string; body: string }) {
  const open = useGuide((state) => state.open);
  const stepIndex = useGuide((state) => state.step);
  const step = GUIDE[stepIndex];
  const heading = open && step ? step.title : title;
  const copy = open && step ? step.body : body;
  return (
    <aside className="rounded-md border border-line bg-bg/60 p-3" data-info-box>
      <p className="text-xs tracking-wide text-gold uppercase">{open ? "Walkthrough" : "About this"}</p>
      <p className="mt-1 font-display text-2xl leading-none text-fg">{heading}</p>
      <p className="mt-2 text-pretty text-sm text-muted">{copy}</p>
      {open && step?.fresh ? <p className="mt-2 text-xs font-medium text-gold">New!</p> : null}
    </aside>
  );
}

function useHintOpen() {
  const guideOpen = useGuide((state) => state.open);
  const [open, setOpen] = useState(false);
  return { shown: guideOpen || open, toggle: () => setOpen((value) => !value) };
}

function InfoButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-sm text-gold"
      aria-expanded={shown}
      aria-label="What this does"
      onClick={onClick}
    >
      i
    </button>
  );
}

function HintCopy({ hint, shown }: { hint?: string; shown: boolean }) {
  if (!hint || !shown) return null;
  return <p className="text-pretty text-sm text-muted">{hint}</p>;
}

/** A row with an i. The canvas walkthrough opens every note at once. */
export function InfoPoint({ hint, children }: { hint: string; children: ReactNode }) {
  const { shown, toggle } = useHintOpen();
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <InfoButton shown={shown} onClick={toggle} />
      </div>
      <HintCopy hint={hint} shown={shown} />
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  hint,
  fresh,
  guideId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  hint?: string;
  fresh?: boolean;
  guideId?: string;
}) {
  const id = useId();
  const guideOpen = useGuide((state) => state.open);
  const guideStep = useGuide((state) => state.step);
  const highlight = GUIDE[guideStep]?.highlight;
  const active = guideOpen && guideId !== undefined && highlight === guideId;
  const ref = useRef<HTMLDivElement>(null);
  const { shown, toggle } = useHintOpen();

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active, guideStep]);

  return (
    <div ref={ref} className={cn("grid gap-1 rounded-md", active && "ring-1 ring-gold")} data-guide={guideId}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm text-muted">
          {label}
        </label>
        <span className="flex items-center gap-2">
          {fresh ? <span className="text-xs font-medium text-gold">New!</span> : null}
          <span className="text-sm tabular-nums text-fg">{display}</span>
          {hint ? <InfoButton shown={shown} onClick={toggle} /> : null}
        </span>
      </div>
      <HintCopy hint={hint} shown={shown} />
      <input
        id={id}
        className="h-11 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        aria-description={hint}
        value={Number.isFinite(value) ? value : min}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { shown, toggle } = useHintOpen();
  return (
    <div className="grid gap-1 py-1">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 text-sm text-fg">{label}</div>
        <div className="flex items-center gap-2">
          {hint ? <InfoButton shown={shown} onClick={toggle} /> : null}
          <Switch.Root
            checked={checked}
            onCheckedChange={onCheckedChange}
            aria-label={label}
            aria-description={hint}
            className={cn("relative h-8 w-14 shrink-0 rounded-full bg-surface-2", "data-[state=checked]:bg-gold")}
          >
            <Switch.Thumb
              className={cn(
                "block size-6 translate-x-1 rounded-full bg-fg transition-transform duration-200",
                "data-[state=checked]:translate-x-7 data-[state=checked]:bg-bg",
              )}
            />
          </Switch.Root>
        </div>
      </div>
      <HintCopy hint={hint} shown={shown} />
    </div>
  );
}
