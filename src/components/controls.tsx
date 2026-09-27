import { useId } from "react";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-muted">
          {label}
        </label>
        <span className="text-sm tabular-nums text-fg">{display}</span>
      </div>
      <input
        id={id}
        className="h-11 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
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
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-sm text-fg">{label}</div>
        {hint ? <p className="text-pretty text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className={cn(
          "relative h-8 w-14 shrink-0 rounded-full bg-surface-2",
          "data-[state=checked]:bg-gold",
        )}
      >
        <Switch.Thumb
          className={cn(
            "block size-6 translate-x-1 rounded-full bg-fg transition-transform duration-200",
            "data-[state=checked]:translate-x-7 data-[state=checked]:bg-bg",
          )}
        />
      </Switch.Root>
    </div>
  );
}
