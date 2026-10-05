import { useEffect, useState, type FormEvent } from "react";
import { DownloadMark } from "@/components/download-mark";
import { Modal } from "@/components/dialogs";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { browseTemplates, getMyProfile, getTemplate, publishTemplate, updateTemplateText } from "@/lib/community/api";
import { notePlay } from "@/lib/community/play";
import { notePresetSave } from "@/lib/community/preset-stats";
import type { CommunityCard, Profile } from "@/lib/community/types";
import { scenePack } from "@/lib/share/scene";
import { useBath } from "@/stores/bath";

const field = "h-11 rounded-md border border-line bg-surface-2 px-3 text-fg";

function packedSettings() {
  const state = useBath.getState();
  const waves = document.querySelector("[data-waves]")?.getAttribute("data-waves") === "open";
  return scenePack(state.settings, state.domes, {
    playing: state.playing,
    waves,
    cycle: state.cycleThrough,
    cycleSeconds: state.cycleSeconds,
  });
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function FanDialog({
  open,
  saving,
  onOpenChange,
}: {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const changed = useBath((state) => state.changed);
  const sourceTemplateId = useBath((state) => state.sourceTemplateId);
  const [cards, setCards] = useState<CommunityCard[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setStatus("loading");
    browseTemplates({ data: { sort: "new" } })
      .then((list) => {
        if (cancel) return;
        setCards(list.filter((card) => card.kind === "track"));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancel) setStatus("error");
      });
    return () => {
      cancel = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || isPending || !user) return;
    let cancel = false;
    getMyProfile()
      .then((result) => {
        if (!cancel) setProfile(result.profile);
      })
      .catch(() => {
        if (!cancel) setProfile(null);
      });
    return () => {
      cancel = true;
    };
  }, [open, isPending, user]);

  async function useBathFrom(id: string) {
    const template = await getTemplate({ data: id }).catch(() => null);
    if (!template) {
      useBath.getState().setNotice("That bath is gone.");
      return;
    }
    useBath.getState().loadPublished(template);
    if (useBath.getState().playing) notePlay(template.id);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Fan Created">
      <div className="grid gap-4">
        <p className="text-pretty text-sm text-muted">
          Baths people saved. Names are usernames, never an email. A first visit may open one of these at random. Open any of them and change it in the room. Saving makes a new one. A bath you saved can also be renamed, or updated in place.
        </p>
        {changed ? (
          <SaveAsNew
            profile={profile}
            signedIn={Boolean(user) && !isPending}
            pending={isPending}
            onSaved={(card) => {
              if (card) setCards((list) => [card, ...list.filter((item) => item.id !== card.id)]);
            }}
          />
        ) : saving ? (
          <p className="text-sm text-muted">Change the bath in the room, then save it as a new one.</p>
        ) : null}
        {status === "loading" ? <p className="text-sm text-muted">Gathering saved baths…</p> : null}
        {status === "error" ? <p className="text-sm text-gold">The saved baths didn’t load.</p> : null}
        {status === "ready" && cards.length === 0 ? (
          <p className="text-pretty text-sm text-muted">No fan baths yet. Change a preset, then save it as a new one.</p>
        ) : null}
        <ul className="grid gap-2">
          {cards.map((card) => (
            <li key={card.id} className="rounded-md border border-line px-3 py-3">
              <div className="flex items-start gap-3">
                {card.image ? (
                  <img
                    src={card.image}
                    alt=""
                    className="size-16 shrink-0 rounded-md border border-line bg-bg object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="font-display text-2xl leading-none text-fg">{card.title}</p>
                  <p className="mt-2 text-xs text-gold">
                    {card.author}
                    {when(card.createdAt) ? ` · ${when(card.createdAt)}` : ""}
                  </p>
                </div>
              </div>
              {card.description ? <p className="mt-2 text-pretty text-sm text-muted">{card.description}</p> : null}
              <p className="mt-1 text-xs tabular-nums text-muted">
                {card.bowls} {card.bowls === 1 ? "bowl" : "bowls"} · {card.plays} {card.plays === 1 ? "play" : "plays"} · {card.shares}{" "}
                {card.shares === 1 ? "share" : "shares"}
                {card.similarity !== undefined ? ` · ${Math.round(card.similarity * 100)}% close` : ""}
              </p>
              {card.sharePath ? <p className="mt-1 truncate text-xs text-muted">{card.sharePath}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="h-11 rounded-md bg-gold px-3 text-sm text-bg" onClick={() => void useBathFrom(card.id)}>
                  Use this bath
                </button>
              </div>
              {card.mine && user ? (
                <OwnerEditors
                  card={card}
                  current={sourceTemplateId === card.id}
                  changed={changed}
                  onRenamed={(next) => setCards((list) => list.map((item) => (item.id === next.id ? { ...item, ...next } : item)))}
                  onUpdated={() => onOpenChange(false)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function OwnerEditors({
  card,
  current,
  changed,
  onRenamed,
  onUpdated,
}: {
  card: CommunityCard;
  current: boolean;
  changed: boolean;
  onRenamed: (card: CommunityCard) => void;
  onUpdated: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
  }, [card.id, card.title, card.description]);

  async function rename(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await updateTemplateText({ data: { id: card.id, title, description } });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result.template) onRenamed(result.template);
      useBath.getState().setNotice("Title and description saved.");
    } catch {
      setError("Could not save that title.");
    } finally {
      setBusy(false);
    }
  }

  async function overwrite() {
    const state = useBath.getState();
    setBusy(true);
    setError(null);
    try {
      const result = await publishTemplate({
        data: {
          id: card.id,
          title: title.trim() || card.title,
          description,
          bowls: state.bowls,
          ears: state.ears,
          settings: packedSettings(),
          receiver: state.receiver,
        },
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      useBath.setState({
        sourceTemplateId: card.id,
        activeName: title.trim() || card.title,
        changed: false,
        loadStamp: Date.now(),
        shareRef: result.userSlug && result.slug ? { userSlug: result.userSlug, slug: result.slug } : state.shareRef,
      });
      useBath.getState().setNotice("Updated your saved bath.");
      onUpdated();
    } catch {
      setError("Could not update that bath.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 grid gap-2 border-t border-line pt-3" onSubmit={(event) => void rename(event)}>
      <p className="text-xs text-gold">Yours</p>
      <label className="grid gap-1 text-sm text-muted">
        Title
        <input className={field} value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm text-muted">
        Description
        <textarea
          className="min-h-20 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="h-11 rounded-md border border-line px-3 text-sm" disabled={busy}>
          Save title
        </button>
        <button type="button" className="h-11 rounded-md border border-gold px-3 text-sm text-gold disabled:opacity-40" disabled={busy || !current || !changed} onClick={() => void overwrite()}>
          Update this bath
        </button>
      </div>
      {!current ? <p className="text-xs text-muted">Use this bath first, then change it, to update the saved one.</p> : null}
    </form>
  );
}

function SaveAsNew({
  profile,
  signedIn,
  pending,
  onSaved,
}: {
  profile: Profile | null | undefined;
  signedIn: boolean;
  pending: boolean;
  onSaved: (card: CommunityCard | null) => void;
}) {
  const activeName = useBath((state) => state.activeName);
  const ears = useBath((state) => state.ears);
  const [title, setTitle] = useState(activeName || "");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) setUsername(profile.username);
  }, [profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const state = useBath.getState();
    setBusy(true);
    setError(null);
    try {
      const result = await publishTemplate({
        data: {
          title,
          description,
          username: profile ? undefined : username,
          parentId: state.sourceTemplateId,
          bowls: state.bowls,
          ears: state.ears,
          settings: packedSettings(),
          receiver: state.receiver,
        },
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      notePresetSave(state.originPresetId, ears.length);
      useBath.setState({
        sourceTemplateId: result.id,
        shareRef: result.userSlug && result.slug ? { userSlug: result.userSlug, slug: result.slug } : null,
        activeName: result.template?.title ?? title.trim(),
        presetId: null,
        changed: false,
        loadStamp: Date.now(),
      });
      onSaved(result.template);
      useBath.getState().setNotice(result.path ? `Saved “${result.template?.title ?? title.trim()}”. ${result.path}` : `Saved “${title.trim()}”.`);
    } catch {
      setError("Could not save that bath.");
    } finally {
      setBusy(false);
    }
  }

  if (pending || (signedIn && profile === undefined)) {
    return <div className="h-24 animate-pulse rounded-md bg-surface-2" />;
  }
  if (!signedIn) {
    return (
      <div className="grid gap-2 rounded-md border border-line p-3">
        <p className="text-pretty text-sm text-muted">Sign in to save this as a new fan bath. Your email stays off the card.</p>
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            type="button"
            className={`h-11 rounded-md text-sm font-medium ${provider.idp === "google" ? "bg-gold text-bg" : "border border-line"}`}
            onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
          >
            Continue with {provider.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form className="grid gap-2 rounded-md border border-gold p-3" onSubmit={(event) => void save(event)}>
      <p className="text-sm text-fg">Save as a new bath</p>
      {!profile ? (
        <label className="grid gap-1 text-sm text-muted">
          Username
          <input className={field} value={username} maxLength={48} required onChange={(event) => setUsername(event.target.value)} />
        </label>
      ) : null}
      <label className="grid gap-1 text-sm text-muted">
        Title
        <input className={field} value={title} maxLength={80} required onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm text-muted">
        Description
        <textarea
          className="min-h-20 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {ears.length > 1 ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <DownloadMark /> {ears.length} ears, so this one is marked for download.
        </p>
      ) : null}
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      <button type="submit" className="h-11 rounded-md bg-gold text-sm font-medium text-bg disabled:opacity-40" disabled={busy}>
        Save new bath
      </button>
    </form>
  );
}
