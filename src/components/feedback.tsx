import { useEffect, useState, type FormEvent } from "react";
import { Bug, Sparkles, X } from "lucide-react";
import { listFeedback, mintCaptcha, submitFeedback } from "@/lib/community/feedback-api";
import type { CaptchaPicture, FeedbackItem, FeedbackKind, FiledReport } from "@/lib/community/feedback";

const field = "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-fg";

function CaptchaArt({ picture }: { picture: CaptchaPicture }) {
  return (
    <svg viewBox="0 0 170 58" className="h-16 w-full rounded-md bg-bg text-fg" role="img" aria-label="Letters to type">
      {picture.fills.map((d, index) => (
        <path key={`${picture.id}-${index}`} d={d} fill="currentColor" />
      ))}
      <path d={picture.scratch} fill="none" className="stroke-gold" strokeWidth="1.4" />
    </svg>
  );
}

export function FeedbackDock({ quiet }: { quiet: boolean }) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [answer, setAnswer] = useState("");
  const [picture, setPicture] = useState<CaptchaPicture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState<FiledReport | null>(null);
  const [nonce, setNonce] = useState(0);
  const hidden = quiet && !kind;

  useEffect(() => {
    if (!kind) return;
    let cancel = false;
    setPicture(null);
    mintCaptcha()
      .then((next) => {
        if (!cancel) setPicture(next);
      })
      .catch(() => {
        if (!cancel) setError("The picture did not load. Try again.");
      });
    return () => {
      cancel = true;
    };
  }, [kind, nonce]);

  function open(next: FeedbackKind) {
    setFiled(null);
    setError(null);
    setKind((current) => (current === next ? null : next));
  }

  function close() {
    setKind(null);
    setFiled(null);
    setError(null);
    setAnswer("");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!kind || !picture || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await submitFeedback({
        data: { kind, title, body, contact, challengeId: picture.id, answer },
      });
      if (!result.ok) {
        setError(result.error);
        if (result.challenge) {
          setPicture(result.challenge);
          setAnswer("");
        }
        return;
      }
      setFiled(result);
      setTitle("");
      setBody("");
      setContact("");
      setAnswer("");
    } catch {
      setError("Could not send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div
        className={`absolute top-1/2 left-3 z-40 flex -translate-y-1/2 flex-col gap-2 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"} transition-opacity duration-700`}
        data-feedback-dock
      >
        <button
          type="button"
          data-feedback="bug"
          className={`grid size-11 place-items-center rounded-full border shadow-lg ${kind === "bug" ? "border-gold bg-gold text-bg" : "border-gold bg-surface/90 text-gold"}`}
          aria-pressed={kind === "bug"}
          aria-label="Report a bug"
          title="Report a bug"
          onClick={() => open("bug")}
        >
          <Bug className="size-5" />
        </button>
        <button
          type="button"
          data-feedback="feature"
          className={`grid size-11 place-items-center rounded-full border shadow-lg ${kind === "feature" ? "border-gold bg-gold text-bg" : "border-gold bg-surface/90 text-gold"}`}
          aria-pressed={kind === "feature"}
          aria-label="Suggest a feature"
          title="Suggest a feature"
          onClick={() => open("feature")}
        >
          <Sparkles className="size-5" />
        </button>
      </div>
      {kind ? (
        <form
          className="fixed top-16 bottom-4 left-16 z-50 flex w-72 flex-col gap-3 overflow-hidden rounded-lg border border-line bg-surface p-3 shadow-lg sm:w-80"
          data-feedback-form={kind}
          onSubmit={(event) => void send(event)}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-2xl leading-none text-fg">{kind === "bug" ? "Bug" : "Feature"}</h2>
            <button type="button" className="grid size-11 place-items-center rounded-md text-muted" aria-label="Close feedback" onClick={close}>
              <X className="size-5" />
            </button>
          </div>
          {filed ? (
            <FiledNote report={filed} onAnother={() => setFiled(null)} />
          ) : (
            <>
              <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto">
                <p className="text-pretty text-sm text-muted">
                  {kind === "bug" ? "What went wrong in the bath?" : "What should the bath do next?"} Venice reads it before it is filed.
                </p>
                <label className="grid gap-1 text-sm text-muted">
                  Title
                  <input className={field} value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm text-muted">
                  Details
                  <textarea
                    className="min-h-20 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
                    value={body}
                    maxLength={4000}
                    required
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm text-muted">
                  Note for the owner
                  <input
                    className={field}
                    value={contact}
                    maxLength={120}
                    placeholder="Optional. Admin only."
                    onChange={(event) => setContact(event.target.value)}
                  />
                </label>
                <div className="grid gap-2">
                  {picture ? <CaptchaArt picture={picture} /> : <div className="h-16 animate-pulse rounded-md bg-surface-2" />}
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor="feedback-captcha">
                      Type the letters in the picture
                    </label>
                    <input
                      id="feedback-captcha"
                      className={field}
                      value={answer}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={8}
                      required
                      placeholder="Letters in the picture"
                      onChange={(event) => setAnswer(event.target.value)}
                    />
                    <button
                      type="button"
                      className="h-11 shrink-0 rounded-md border border-line px-3 text-sm text-fg"
                      onClick={() => {
                        setAnswer("");
                        setNonce((value) => value + 1);
                      }}
                    >
                      New
                    </button>
                  </div>
                </div>
                {error ? <p className="text-sm text-gold">{error}</p> : null}
              </div>
              <button type="submit" className="h-11 shrink-0 rounded-md bg-gold text-sm font-medium text-bg disabled:opacity-40" disabled={sending || !picture}>
                {sending ? "Checking…" : "Send"}
              </button>
            </>
          )}
        </form>
      ) : null}
    </>
  );
}

function FiledNote({ report, onAnother }: { report: FiledReport; onAnother: () => void }) {
  const lead =
    report.status === "draft"
      ? "Filed. Venice accepted it as a possible change and opened a draft pull request. It does not merge on its own."
      : report.status === "spam"
        ? "Filed for review. It was flagged, so no pull request was opened."
        : report.status === "issue"
          ? "Filed as an issue. Venice kept it as a note, not a code change."
          : "Saved in Admin. The repository did not take it this time.";
  return (
    <div className="grid gap-3" data-feedback-result={report.status}>
      <p className="text-pretty text-sm text-fg">{lead}</p>
      {report.summary ? <p className="text-pretty text-sm text-muted">{report.summary}</p> : null}
      {report.issueUrl ? (
        <a className="text-sm text-gold underline" href={report.issueUrl} target="_blank" rel="noreferrer">
          Open the issue
        </a>
      ) : null}
      {report.prUrl ? (
        <a className="text-sm text-gold underline" href={report.prUrl} target="_blank" rel="noreferrer">
          Open the draft pull request
        </a>
      ) : null}
      <button type="button" className="h-11 rounded-md border border-line text-sm text-fg" onClick={onAnother}>
        Send another
      </button>
    </div>
  );
}

function statusLabel(item: FeedbackItem): string {
  if (item.status === "draft") return "Draft pull request";
  if (item.status === "spam") return "Flagged";
  if (item.status === "issue") return "Issue";
  return "Saved here";
}

function age(isoTime: string): string {
  const delta = Date.now() - new Date(isoTime).getTime();
  const minutes = Math.round(delta / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function FeedbackInbox() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<"all" | "bug" | "feature" | "draft">("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    listFeedback()
      .then((result) => {
        if (cancel) return;
        setAdmin(result.admin);
        setItems(result.items);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const shown = items.filter((item) => {
    if (filter === "bug" || filter === "feature") return item.kind === filter;
    if (filter === "draft") return item.status === "draft";
    return true;
  });

  if (failed) return <p className="text-sm text-gold">The inbox did not load.</p>;
  if (admin === null) return <div className="h-28 animate-pulse rounded-lg bg-surface-2" />;
  if (!admin) {
    return <p className="text-pretty text-sm text-muted">The inbox is for the owner of the bath.</p>;
  }

  const filters = [
    ["all", "All"],
    ["bug", "Bugs"],
    ["feature", "Features"],
    ["draft", "Pull requests"],
  ] as const;

  return (
    <div className="grid gap-3" data-admin-inbox>
      <p className="text-pretty text-sm text-muted">
        Bugs and features from the buttons on the left. Contact stays here. The public issue does not include it.
      </p>
      <div className="flex flex-wrap gap-2">
        {filters.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`h-11 rounded-full border px-3 text-sm ${filter === id ? "border-gold bg-gold text-bg" : "border-line text-fg"}`}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-pretty text-sm text-muted">Nothing in this list yet.</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((item) => (
            <li key={item.id} className="grid gap-1 rounded-lg border border-line bg-bg px-3 py-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded-full border border-line px-2 py-1 text-fg">{item.kind === "bug" ? "Bug" : "Feature"}</span>
                <span>{statusLabel(item)}</span>
                <span className="ml-auto tabular-nums">{age(item.createdAt)}</span>
              </div>
              <p className="text-fg">{item.title}</p>
              {item.summary ? <p className="text-pretty text-sm text-muted">{item.summary}</p> : null}
              {item.note ? <p className="text-pretty text-sm text-gold">{item.note}</p> : null}
              {item.contact ? <p className="text-sm text-muted">Owner note: {item.contact}</p> : null}
              <div className="flex flex-wrap gap-3">
                {item.issueUrl ? (
                  <a className="text-sm text-gold underline" href={item.issueUrl} target="_blank" rel="noreferrer">
                    Issue
                  </a>
                ) : null}
                {item.prUrl ? (
                  <a className="text-sm text-gold underline" href={item.prUrl} target="_blank" rel="noreferrer">
                    Draft pull request
                  </a>
                ) : null}
              </div>
              <details className="text-sm text-muted">
                <summary className="cursor-pointer py-1 text-fg">Note</summary>
                <p className="text-pretty pt-1">{item.body}</p>
                {item.proposal ? <p className="text-pretty pt-2">{item.proposal}</p> : null}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
