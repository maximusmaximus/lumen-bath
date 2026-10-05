import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Modal } from "@/components/dialogs";
import { DownloadMark } from "@/components/download-mark";
import { notePresetSave } from "@/lib/community/preset-stats";
import {
  addComment,
  browseTemplates,
  getMyProfile,
  getShowcase,
  getTemplate,
  listComments,
  publishTemplate,
  recordShare,
  removeComment,
} from "@/lib/community/api";
import { notePlay } from "@/lib/community/play";
import type { CommunityCard, CommunityComment, Profile } from "@/lib/community/types";
import { exportPayload, parseImport, useBath } from "@/stores/bath";

type Tab = "community" | "share" | "browser";
type Sort = "played" | "new" | "similar";

const field = "h-11 rounded-md border border-line bg-surface-2 px-3 text-fg";

export function AccountLink({ onDash }: { onDash: () => void }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <span className="h-11 w-16 animate-pulse rounded-md bg-surface-2" aria-hidden="true" />;
  if (!user) {
    return (
      <Link to="/login" search={{ next: "/" }} className="inline-flex h-11 items-center rounded-md border border-line px-3 text-sm">
        Sign in
      </Link>
    );
  }
  return (
    <button type="button" className="inline-flex h-11 items-center rounded-md border border-line px-3 text-sm" onClick={onDash}>
      Dash
    </button>
  );
}

function SignInRow() {
  return (
    <div className="grid gap-2">
      <p className="text-pretty text-sm text-muted">Sign in to share a bath or leave a comment. You stay signed in on this browser.</p>
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

export function SavedTracksDialog({
  open,
  onOpenChange,
  onEditProfile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditProfile?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("community");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Saved tracks">
      <div className="mb-3 flex gap-2">
        {(
          [
            ["community", "Community"],
            ["share", "Share"],
            ["browser", "This browser"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`h-10 rounded-full px-3 text-sm ${tab === id ? "bg-gold text-bg" : "border border-line text-fg"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "community" ? <CommunityTab open={open} onOpenChange={onOpenChange} /> : null}
      {tab === "share" ? <ShareTab open={open} onShared={() => setTab("community")} onEditProfile={onEditProfile} /> : null}
      {tab === "browser" ? <BrowserTab /> : null}
    </Modal>
  );
}

function CommunityTab({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sort, setSort] = useState<Sort>("played");
  const [cards, setCards] = useState<CommunityCard[]>([]);
  const [daily, setDaily] = useState<CommunityCard | null>(null);
  const [latest, setLatest] = useState<CommunityCard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setStatus("loading");
    const state = useBath.getState();
    Promise.all([
      getShowcase(),
      browseTemplates({
        data: {
          sort,
          excludeId: state.sourceTemplateId,
          bowls: state.bowls,
          settings: state.settings,
          receiver: state.receiver,
        },
      }),
    ])
      .then(([showcase, list]) => {
        if (cancel) return;
        setDaily(showcase.daily);
        setLatest(showcase.latest);
        setCards(
          list.filter((card) => card.id !== showcase.daily?.id && card.id !== showcase.latest?.id),
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!cancel) setStatus("error");
      });
    return () => {
      cancel = true;
    };
  }, [open, sort]);

  async function listen(id: string, remix: boolean) {
    const template = await getTemplate({ data: id }).catch(() => null);
    if (!template) {
      useBath.getState().setNotice("That bath is gone.");
      return;
    }
    useBath.getState().loadPublished(template);
    if (remix) useBath.getState().setNotice(`Remixing “${template.title}”. Share it when it’s yours.`);
    if (useBath.getState().playing) notePlay(template.id);
    onOpenChange(false);
  }

  function bumpShare(id: string, shares: number) {
    const apply = (card: CommunityCard | null) => (card && card.id === id ? { ...card, shares } : card);
    setDaily((card) => apply(card));
    setLatest((card) => apply(card));
    setCards((list) => list.map((card) => (card.id === id ? { ...card, shares } : card)));
  }

  return (
    <div className="grid gap-3">
      <p className="text-pretty text-sm text-muted">
        Shared baths keep a signature of pitch and placement, so you can find ones close to what you’re hearing and remix them.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Feature card={daily} kicker="Today" onListen={listen} onShare={bumpShare} />
        <Feature card={latest} kicker="Latest template" onListen={listen} onShare={bumpShare} />
      </div>
      <div className="flex gap-2">
        {(
          [
            ["played", "Most played"],
            ["new", "Newest"],
            ["similar", "Similar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`h-9 rounded-full px-3 text-xs ${sort === id ? "bg-surface-2 text-gold" : "text-muted"}`}
            onClick={() => setSort(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {status === "loading" ? <p className="text-sm text-muted">Gathering baths…</p> : null}
      {status === "error" ? <p className="text-sm text-gold">The shared library didn’t load.</p> : null}
      {status === "ready" && cards.length === 0 ? (
        <p className="text-pretty text-sm text-muted">No shared baths yet. Share yours and it becomes something other people can play.</p>
      ) : null}
      <ul className="grid gap-2">
        {cards.map((card) => (
          <li key={card.id} className="rounded-md border border-line px-3 py-2">
            <button type="button" className="w-full py-1 text-left" onClick={() => setOpenId((current) => (current === card.id ? null : card.id))}>
              <span className="block truncate">{card.title}</span>
              <span className="text-xs tabular-nums text-muted">
                {card.author} · {card.plays} plays · {card.shares} shares
                {card.similarity !== undefined ? ` · ${Math.round(card.similarity * 100)}% close` : ""}
              </span>
            </button>
            {openId === card.id ? (
              <TrackDetail card={card} onListen={listen} onShare={bumpShare} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feature({
  card,
  kicker,
  onListen,
  onShare,
}: {
  card: CommunityCard | null;
  kicker: string;
  onListen: (id: string, remix: boolean) => void;
  onShare: (id: string, shares: number) => void;
}) {
  if (!card) return <div className="h-28 animate-pulse rounded-md bg-surface-2" />;
  return (
    <article className="rounded-md border border-gold bg-surface-2 p-3">
      <p className="text-xs tracking-wide text-gold uppercase">{kicker}</p>
      <h3 className="mt-1 font-display text-2xl leading-none">{card.title}</h3>
      <p className="mt-2 line-clamp-3 text-pretty text-xs text-muted">{card.description}</p>
      <p className="mt-2 text-xs tabular-nums text-muted">
        {card.plays} plays · {card.shares} shares
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="h-10 flex-1 rounded-md bg-gold text-sm text-bg" onClick={() => onListen(card.id, false)}>
          Listen
        </button>
        <button type="button" className="h-10 flex-1 rounded-md border border-line text-sm" onClick={() => onListen(card.id, true)}>
          Remix
        </button>
        <ShareButton id={card.id} path={card.sharePath} onShare={onShare} />
      </div>
    </article>
  );
}

function ShareButton({ id, path, onShare }: { id: string; path: string | null; onShare: (id: string, shares: number) => void }) {
  return (
    <button
      type="button"
      className="h-10 rounded-md border border-line px-3 text-sm"
      onClick={() => {
        const href = path
          ? new URL(path, window.location.origin).toString()
          : (() => {
              const url = new URL(window.location.href);
              url.pathname = "/";
              url.search = "";
              url.searchParams.set("t", id);
              return url.toString();
            })();
        try {
          void navigator.clipboard.writeText(href).then(
            () => useBath.getState().setNotice("Link copied."),
            () => useBath.getState().setNotice("Could not copy the link."),
          );
        } catch {
          useBath.getState().setNotice("Could not copy the link.");
        }
        void recordShare({ data: id })
          .then((result) => {
            if (result.ok) onShare(id, result.shares);
          })
          .catch(() => undefined);
      }}
    >
      Share
    </button>
  );
}

function TrackDetail({
  card,
  onListen,
  onShare,
}: {
  card: CommunityCard;
  onListen: (id: string, remix: boolean) => void;
  onShare: (id: string, shares: number) => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    let cancel = false;
    listComments({ data: card.id })
      .then((rows) => {
        if (!cancel) setComments(rows);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [card.id]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await addComment({ data: { templateId: card.id, body } }).catch(() => null);
    if (!result) {
      setError("Could not post that.");
      return;
    }
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if (!("comment" in result) || !result.comment) {
      setError("Could not post that.");
      return;
    }
    setComments((list) => [...list, result.comment]);
    setBody("");
  }

  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <p className="text-pretty text-sm text-muted">{card.description}</p>
      <div className="flex gap-2">
        <button type="button" className="h-10 flex-1 rounded-md bg-gold text-sm text-bg" onClick={() => onListen(card.id, false)}>
          Listen
        </button>
        <button type="button" className="h-10 flex-1 rounded-md border border-line text-sm" onClick={() => onListen(card.id, true)}>
          Remix
        </button>
        <ShareButton id={card.id} path={card.sharePath} onShare={onShare} />
      </div>
      <ul className="grid gap-2">
        {comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <span className="text-gold">{comment.author}</span> <span className="text-pretty">{comment.body}</span>
            {userId === comment.userId ? (
              <button
                type="button"
                className="ml-2 text-xs text-muted"
                onClick={() => {
                  void removeComment({ data: comment.id }).then((result) => {
                    if (result.ok) setComments((list) => list.filter((item) => item.id !== comment.id));
                  });
                }}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {isPending ? <div className="h-11 animate-pulse rounded-md bg-surface-2" /> : null}
      {!isPending && !user ? <SignInRow /> : null}
      {!isPending && user ? (
        <form className="grid gap-2" onSubmit={(event) => void send(event)}>
          <textarea
            className="min-h-20 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
            value={body}
            maxLength={500}
            placeholder="A note, emoji welcome"
            onChange={(event) => setBody(event.target.value)}
          />
          {error ? <p className="text-sm text-gold">{error}</p> : null}
          <button type="submit" className="h-10 rounded-md border border-line text-sm">
            Comment
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ShareTab({ open, onShared, onEditProfile }: { open: boolean; onShared: () => void; onEditProfile?: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const activeName = useBath((state) => state.activeName);
  const ears = useBath((state) => state.ears);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setTitle((current) => current || activeName || "");
  }, [open, activeName]);

  useEffect(() => {
    if (!open || isPending || !user) return;
    let cancel = false;
    getMyProfile()
      .then((result) => {
        if (cancel) return;
        setProfile(result.profile);
        if (result.profile) {
          setUsername(result.profile.username);
          setBio(result.profile.bio);
          setWebsite(result.profile.website);
        }
      })
      .catch(() => {
        if (!cancel) setProfile(null);
      });
    return () => {
      cancel = true;
    };
  }, [open, isPending, user]);

  async function share(event: FormEvent) {
    event.preventDefault();
    const state = useBath.getState();
    const selectedIndex = state.bowls.findIndex((bowl) => bowl.id === state.selectedId);
    setSaving(true);
    setError(null);
    try {
      const result = await publishTemplate({
        data: {
          title,
          description,
          username: profile ? undefined : username,
          bio: profile ? undefined : bio,
          website: profile ? undefined : website,
          parentId: state.sourceTemplateId,
          id: state.sourceTemplateId ?? undefined,
          selectedIndex,
          bowls: state.bowls,
          ears: state.ears,
          settings: state.settings,
          receiver: state.receiver,
        },
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.template) {
        notePresetSave(state.originPresetId, state.ears.length);
        useBath.setState({
          sourceTemplateId: result.id,
          shareRef: { userSlug: result.userSlug, slug: result.slug },
          activeName: result.template.title,
          presetId: null,
        });
      }
      useBath.getState().setNotice(result.path ? `Shared “${result.template?.title ?? title.trim()}”. ${result.path}` : `Shared “${title.trim()}”.`);
      onShared();
    } catch {
      setError("Could not share that bath.");
    } finally {
      setSaving(false);
    }
  }

  if (isPending || (user && profile === undefined)) {
    return <div className="h-24 animate-pulse rounded-md bg-surface-2" />;
  }
  if (!user) return <SignInRow />;

  return (
    <form className="grid gap-3" onSubmit={(event) => void share(event)}>
      <p className="text-pretty text-sm text-muted">
        Sharing stores the bath so others can listen, remix, and find it by how the bowls are tuned and placed. Emoji are fine in every field.
      </p>
      {!profile ? (
        <>
          <label className="grid gap-1 text-sm text-muted">
            Username
            <input className={field} name="username" autoComplete="username" value={username} maxLength={48} required onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Bio
            <textarea
              className="min-h-20 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
              value={bio}
              maxLength={400}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Site
            <input className={field} name="website" autoComplete="url" value={website} placeholder="example.com" maxLength={300} onChange={(event) => setWebsite(event.target.value)} />
          </label>
        </>
      ) : (
        <p className="text-sm text-muted">
          Sharing as <span className="text-fg">{profile.username}</span>.{" "}
          <button type="button" className="text-gold" onClick={() => onEditProfile?.()}>
            Edit profile
          </button>
        </p>
      )}
      <label className="grid gap-1 text-sm text-muted">
        Title
        <input className={field} value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm text-muted">
        Description
        <textarea
          className="min-h-24 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
          value={description}
          maxLength={700}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      <button type="submit" className="h-11 rounded-md bg-gold text-sm font-medium text-bg" disabled={saving}>
        <span className="inline-flex items-center justify-center gap-2">
          {saving ? "Sharing…" : "Share online"}
          {!saving && ears.length > 1 ? <DownloadMark compact /> : null}
        </span>
      </button>
    </form>
  );
}

function BrowserTab() {
  const library = useBath((state) => state.library);
  const activeName = useBath((state) => state.activeName);
  const ears = useBath((state) => state.ears);
  const saveSoundscape = useBath((state) => state.saveSoundscape);
  const loadSoundscape = useBath((state) => state.loadSoundscape);
  const deleteSoundscape = useBath((state) => state.deleteSoundscape);
  const importLibrary = useBath((state) => state.importLibrary);
  const setNotice = useBath((state) => state.setNotice);
  const [name, setName] = useState(activeName ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim().slice(0, 48);
          const state = useBath.getState();
          saveSoundscape(name);
          if (trimmed && useBath.getState().activeName === trimmed) notePresetSave(state.originPresetId, state.ears.length);
        }}
      >
        <p className="text-pretty text-sm text-muted">A private copy on this device. Share it from the other tab if you want it online.</p>
        <label className="grid gap-1 text-sm text-muted">
          Name
          <input className={field} value={name} maxLength={48} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="h-11 rounded-md border border-line text-sm">
          <span className="inline-flex items-center justify-center gap-2">
            Save in this browser
            {ears.length > 1 ? <DownloadMark compact /> : null}
          </span>
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-11 flex-1 rounded-md border border-line text-sm"
            onClick={() => {
              const payload = exportPayload(useBath.getState().library);
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "lumen-bath-soundscapes.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download
          </button>
          <button type="button" className="h-11 flex-1 rounded-md border border-line text-sm" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const items = parseImport(await file.text());
                if (!items.length) {
                  setNotice("That file had no soundscapes.");
                  return;
                }
                importLibrary(items);
              } catch {
                setNotice("Could not read that file.");
              }
            }}
          />
        </div>
      </form>
      <ul className="mt-4 grid gap-2">
        {library.length === 0 ? (
          <li className="text-sm text-muted">Nothing saved on this device yet.</li>
        ) : (
          library.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <button type="button" className="min-w-0 flex-1 py-2 text-left" onClick={() => loadSoundscape(item.id)}>
                <span className="block truncate">{item.name}</span>
                <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
                  <span>
                    {item.bowls.length} bowls
                    {(item.ears?.length ?? 0) > 1 ? ` · ${item.ears?.length} stems` : ""}
                  </span>
                  {(item.ears?.length ?? 0) > 1 ? <DownloadMark compact /> : null}
                </span>
              </button>
              <button type="button" className="h-11 px-2 text-sm text-muted" onClick={() => deleteSoundscape(item.id)}>
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
