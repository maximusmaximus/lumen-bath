import { createFileRoute } from "@tanstack/react-router";
import { BathApp } from "@/components/bath-app";
import { cleanCastCode } from "@/lib/cast/protocol";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { t?: string; dash?: 1; cast?: string } => {
    const t = typeof search.t === "string" ? search.t : "";
    const raw = search.dash;
    const dash = raw === 1 || raw === "1" ? 1 : undefined;
    const cast = cleanCastCode(typeof search.cast === "string" ? search.cast : "") ?? undefined;
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(t)) return { dash, cast };
    return { t, dash, cast };
  },
  component: Home,
});

function Home() {
  const { t, dash, cast } = Route.useSearch();
  return <BathApp templateId={t} startDash={dash === 1} castCode={cast} />;
}