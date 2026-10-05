import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/dialogs";
import type { CastRole } from "@/lib/cast/protocol";
import { cleanCastCode } from "@/lib/cast/protocol";

export function CastDialog({
  open,
  onOpenChange,
  code,
  role,
  paired,
  failed,
  onJoin,
  onStop,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string | null;
  role: CastRole | null;
  paired: boolean;
  failed: boolean;
  onJoin: (code: string) => void;
  onStop: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !code || typeof window === "undefined") {
      setQr(null);
      return;
    }
    const url = `${window.location.origin}/?cast=${code}`;
    let cancel = false;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      color: { dark: "#14221c", light: "#f6f1e7" },
    })
      .then((data) => {
        if (!cancel) setQr(data);
      })
      .catch(() => {
        if (!cancel) setQr(null);
      });
    return () => {
      cancel = true;
    };
  }, [open, code]);

  const roleLine =
    role === "display"
      ? "This is the larger screen, so the menus are off. It follows the other device and draws in ultra HD when this machine can."
      : role === "control"
        ? "This is the controller. Bowls, the ear, and stems are buttons. Slide a bowl's rim or tap it to strike, and the larger screen is what you hear."
        : paired
          ? "Connected. Comparing screen sizes."
          : "Open Cast on the other screen and scan this, or type the code.";

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cast">
      <div className="grid gap-4" data-cast-dialog="open">
        <p className="text-pretty text-sm text-muted">{roleLine}</p>
        {code ? (
          <div className="grid justify-items-center gap-3 rounded-md border border-line bg-bg/40 px-3 py-4">
            <p className="text-xs tracking-wide text-muted uppercase">Pair code</p>
            <p className="font-display text-5xl tracking-[0.28em] text-fg" data-cast-code={code}>
              {code}
            </p>
            {qr ? <img src={qr} alt="QR code that opens this pair" width={220} height={220} className="rounded-md" /> : null}
            <p className="text-center text-xs text-muted">Scan to open this bath and pair. Or type the code on the other screen.</p>
          </div>
        ) : null}
        {failed ? <p className="text-sm text-gold">The direct link did not open. Put both screens on the same Wi-Fi and try the code again.</p> : null}
        {paired ? (
          <button type="button" className="h-11 rounded-md border border-line text-sm" onClick={onStop}>
            Stop casting
          </button>
        ) : (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = cleanCastCode(typed);
              if (!next) {
                setJoinError("Enter the six-character code.");
                return;
              }
              setJoinError(null);
              onJoin(next);
            }}
          >
            <label className="grid gap-1 text-sm text-muted">
              Join a code
              <input
                className="h-11 rounded-md border border-line bg-surface-2 px-3 tracking-[0.2em] text-fg uppercase"
                value={typed}
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value.toUpperCase())}
              />
            </label>
            {joinError ? <p className="text-sm text-gold">{joinError}</p> : null}
            <button type="submit" className="h-11 rounded-md bg-gold text-sm font-medium text-bg">
              Pair
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
