import { Download } from "lucide-react";

/** A multi-stem bath is easier to keep as a download than as one live mix. */
export function DownloadMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-gold"
      title="Several stems. A download keeps each ear as its own left and right."
    >
      <Download className="size-3.5" aria-hidden="true" />
      {compact ? <span className="sr-only">Download setup</span> : <span className="text-xs">Download</span>}
    </span>
  );
}
