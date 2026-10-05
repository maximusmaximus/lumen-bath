import { useEffect, useMemo, useState } from "react";
import { Code, Download, Link2, Mail, MessageCircle, Share2, X } from "lucide-react";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PRESETS, getPreset, instantiatePreset } from "@/lib/audio/presets";
import { getRoom } from "@/lib/audio/rooms";
import type { Bowl, Ear, Receiver, Settings } from "@/lib/audio/types";
import { getMyProfile, publishTemplate, recordShare } from "@/lib/community/api";
import { captureSceneShot, scenePack } from "@/lib/share/scene";
import { renderShareSvg, type ShareCard } from "@/lib/share/card";
import { HOUSE_SLUG, shareCardPath, sharePath, slugify } from "@/lib/share/slug";
import { useBath } from "@/stores/bath";

function absolute(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function cardFromHref(href: string): string {
  const parts = new URL(href).pathname.replace(/\.html$/i, "").split("/").filter(Boolean);
  const user = parts[1];
  const slug = parts[2];
  if (parts[0] !== "s" || !user || !slug) return href;
  return absolute(shareCardPath(user, slug));
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    useBath.getState().setNotice("Link copied.");
  } catch {
    useBath.getState().setNotice("Could not copy the link.");
  }
}

type Tab = "live" | "preset" | "saved";

type Snapshot = {
  title: string;
  bowls: Bowl[];
  ears: Ear[];
  settings: Settings;
  receiver: Receiver;
  id: string | null;
  savedId: string | null;
  bindLive: boolean;
};

export function ViewportShare({ quiet = false, waves = false }: { quiet?: boolean; waves?: boolean }) {
  const [open, setOpen] = useState(false);
  const dim = quiet && !open;
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          aria-label="Close share"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className={`pointer-events-auto absolute right-3 bottom-20 z-50 lg:bottom-8 ${dim ? "pointer-events-none opacity-0" : ""}`}>
        <button
          type="button"
          data-share-toggle
          aria-expanded={open}
          aria-label="Share this view"
          title="Share this view"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-gold bg-surface/90 px-3 text-sm text-gold shadow-lg"
          onClick={() => setOpen((value) => !value)}
        >
          <Share2 className="size-4" />
          <span className="hidden md:inline">Share</span>
        </button>
        {open ? <ShareSheet waves={waves} onClose={() => setOpen(false)} /> : null}
      </div>
    </>
  );
}

export function ShareSheet({ onClose, waves = false }: { onClose: () => void; waves?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const presetId = useBath((state) => state.presetId);
  const shareRef = useBath((state) => state.shareRef);
  const sourceTemplateId = useBath((state) => state.sourceTemplateId);
  const activeName = useBath((state) => state.activeName);
  const library = useBath((state) => state.library);
  const bowls = useBath((state) => state.bowls);
  const ears = useBath((state) => state.ears);
  const settings = useBath((state) => state.settings);
  const receiver = useBath((state) => state.receiver);
  const [tab, setTab] = useState<Tab>("live");
  const [presetPick, setPresetPick] = useState(presetId ?? PRESETS[0]?.id ?? "");
  const [savedPick, setSavedPick] = useState(library[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [name, setName] = useState(activeName || getPreset(presetId)?.name || "");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardVersion, setCardVersion] = useState(0);
  const [cardFailed, setCardFailed] = useState(false);
  const [shot, setShot] = useState("");

  useEffect(() => {
    setShot(captureSceneShot());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    getMyProfile()
      .then((result) => {
        if (!cancel) setProfileName(result.profile?.username ?? "");
      })
      .catch(() => {
        if (!cancel) setProfileName("");
      });
    return () => {
      cancel = true;
    };
  }, [user]);

  const preset = tab === "live" ? getPreset(presetId) : undefined;
  const pickedPreset = tab === "preset" ? getPreset(presetPick) ?? PRESETS[0] : undefined;
  const pickedSaved = tab === "saved" ? library.find((item) => item.id === savedPick) ?? library[0] : undefined;

  const known = useMemo(() => {
    if (pickedPreset) return { user: HOUSE_SLUG, slug: pickedPreset.id, author: "Lumen" };
    if (pickedSaved?.share) return { user: pickedSaved.share.userSlug, slug: pickedSaved.share.slug, author: profileName || "You" };
    if (tab === "live" && shareRef) return { user: shareRef.userSlug, slug: shareRef.slug, author: profileName || "You" };
    return null;
  }, [pickedPreset, pickedSaved, tab, shareRef, profileName]);

  const title = pickedPreset?.name || pickedSaved?.name || name.trim() || preset?.name || activeName || "Untitled bath";
  const author = known?.author || profileName || (username.trim() ? username.trim() : "You");
  const nameSlug = slugify(profileName || username) || "your-name";
  const titleSlug = slugify(title) || "bath";
  const path = known ? sharePath(known.user, known.slug) : null;
  const predicted = sharePath(nameSlug === "your-name" ? "your-name" : nameSlug, titleSlug);
  const needsAccount = !path;
  const profileLoading = Boolean(user) && profileName === null;

  const card = useMemo<ShareCard>(() => {
    if (pickedPreset) {
      const made = instantiatePreset(pickedPreset.id);
      return {
        title: pickedPreset.name,
        author: "Lumen",
        room: made.settingsPatch.roomShape ?? "rotunda",
        bowls: made.bowls.map((bowl) => ({ x: bowl.x, y: bowl.y })),
        ears: made.ears.map((ear) => ({ x: ear.x, y: ear.y })),
      };
    }
    if (pickedSaved) {
      const pose = pickedSaved.ears ?? [];
      return {
        title: pickedSaved.name,
        author,
        room: pickedSaved.settings.roomShape,
        bowls: pickedSaved.bowls.map((bowl) => ({ x: bowl.x, y: bowl.y })),
        ears: pose.map((ear) => ({ x: ear.x, y: ear.y })),
      };
    }
    return {
      title,
      author,
      room: settings.roomShape,
      bowls: bowls.map((bowl) => ({ x: bowl.x, y: bowl.y })),
      ears: ears.map((ear) => ({ x: ear.x, y: ear.y })),
    };
  }, [pickedPreset, pickedSaved, title, author, settings.roomShape, bowls, ears]);

  const preview = useMemo(() => renderShareSvg(card), [card]);
  const cardSrc = known && !cardFailed ? `${shareCardPath(known.user, known.slug)}${cardVersion ? `&v=${cardVersion}` : ""}` : "";
  useEffect(() => setCardFailed(false), [known?.user, known?.slug]);

  async function publishSnapshot(body: Snapshot): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      if (body.bindLive) {
      const savedName = body.title.trim().slice(0, 48);
      useBath.getState().saveSoundscape(savedName);
      const saved = useBath.getState().library.find((item) => item.name.toLowerCase() === savedName.toLowerCase());
      body.savedId = saved?.id ?? body.savedId;
    }
    const result = await publishTemplate({
        data: {
          id: body.id ?? undefined,
          title: body.title,
          description: `${body.bowls.length} bowls in a ${getRoom(body.settings.roomShape).label}.`,
          username: profileName ? undefined : username,
          parentId: body.bindLive ? useBath.getState().sourceTemplateId : null,
          bowls: body.bowls,
          ears: body.ears,
          settings: body.settings,
          receiver: body.receiver,
        },
      });
      if ("error" in result) {
        setError(result.error);
        return null;
      }
      useBath.getState().stampShare({
        userSlug: result.userSlug,
        slug: result.slug,
        templateId: result.id,
        name: result.template?.title ?? body.title,
        savedId: body.savedId,
        bindLive: body.bindLive,
      });
      setCardVersion(Date.now());
      useBath.getState().setNotice(`Shared as ${result.path}`);
      return result.path;
    } catch {
      setError("Could not share that bath.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function liveSnapshot(): Snapshot {
    const state = useBath.getState();
    return {
      title,
      bowls: state.bowls,
      ears: state.ears,
      settings: scenePack(state.settings, state.domes, {
        playing: state.playing,
        waves,
        cycle: state.cycleThrough,
        cycleSeconds: state.cycleSeconds,
      }),
      receiver: state.ears[0] ?? state.receiver,
      id: state.sourceTemplateId,
      savedId: null,
      bindLive: true,
    };
  }

  function savedSnapshot(item: NonNullable<typeof pickedSaved>): Snapshot {
    return {
      title: item.name,
      bowls: item.bowls,
      ears: item.ears ?? [],
      settings: item.settings,
      receiver: item.ears?.[0] ?? item.receiver ?? receiver,
      id: item.share?.templateId ?? null,
      savedId: item.id,
      bindLive: false,
    };
  }

  async function ensureLink(): Promise<string | null> {
    if (path) return absolute(path);
    if (pickedSaved) {
      const next = await publishSnapshot(savedSnapshot(pickedSaved));
      return next ? absolute(next) : null;
    }
    const next = await publishSnapshot(liveSnapshot());
    return next ? absolute(next) : null;
  }

  async function withLink(run: (href: string, image: string) => void | Promise<void>) {
    const href = await ensureLink();
    if (!href) return;
    if (tab === "live" && sourceTemplateId && !preset) void recordShare({ data: sourceTemplateId }).catch(() => undefined);
    await run(href, cardFromHref(href));
  }

  async function nativeShare(href: string, image: string) {
    const text = `${title} — a Lumen Bath`;
    if (!navigator.share) {
      await copyText(href);
      return;
    }
    try {
      const response = await fetch(image);
      if (response.ok && navigator.canShare) {
        const file = new File([await response.blob()], `${titleSlug}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file], url: href })) {
          await navigator.share({ title, text, url: href, files: [file] });
          return;
        }
      }
      await navigator.share({ title, text, url: href });
    } catch {
      /* dismissed */
    }
  }

  const destinations = [
    { label: "Copy link", icon: Link2, run: (href: string) => void copyText(href) },
    { label: "Share…", icon: Share2, run: (href: string, image: string) => void nativeShare(href, image) },
    {
      label: "X",
      icon: Share2,
      run: (href: string) => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title} — a Lumen Bath`)}&url=${encodeURIComponent(href)}`, "_blank", "noopener"),
    },
    {
      label: "Facebook",
      icon: Share2,
      run: (href: string) => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(href)}`, "_blank", "noopener"),
    },
    {
      label: "WhatsApp",
      icon: MessageCircle,
      run: (href: string) => window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${href}`)}`, "_blank", "noopener"),
    },
    {
      label: "Telegram",
      icon: MessageCircle,
      run: (href: string) => window.open(`https://t.me/share/url?url=${encodeURIComponent(href)}&text=${encodeURIComponent(title)}`, "_blank", "noopener"),
    },
    {
      label: "Reddit",
      icon: Share2,
      run: (href: string) => window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(href)}&title=${encodeURIComponent(title)}`, "_blank", "noopener"),
    },
    {
      label: "LinkedIn",
      icon: Share2,
      run: (href: string) => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(href)}`, "_blank", "noopener"),
    },
    {
      label: "Email",
      icon: Mail,
      run: (href: string) => {
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${href}`)}`;
      },
    },
    {
      label: "Messages",
      icon: MessageCircle,
      run: (href: string) => {
        window.location.href = `sms:?&body=${encodeURIComponent(`${title} ${href}`)}`;
      },
    },
    {
      label: "Embed",
      icon: Code,
      run: (href: string) => void copyText(`<iframe src="${href}" title="${title}" width="960" height="640" style="border:0"></iframe>`),
    },
    {
      label: "Save card",
      icon: Download,
      run: (_href: string, image: string) => {
        const link = document.createElement("a");
        link.href = image;
        link.download = `${titleSlug}.png`;
        link.click();
      },
    },
  ];

  const locked =
    busy ||
    (needsAccount &&
      (profileLoading || !user || (profileName === "" && !username.trim()) || (tab === "live" && !name.trim()) || (tab === "saved" && !pickedSaved)));

  return (
    <div
      data-share-panel
      className="absolute right-0 bottom-14 z-40 grid max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-2xl leading-none">Share</p>
        <button type="button" className="grid size-9 place-items-center rounded-full border border-line" aria-label="Close share" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      {shot && tab === "live" ? (
        <img alt={`Snapshot of ${title || "this bath"}`} className="aspect-[1200/630] w-full rounded-md border border-line bg-bg object-cover" src={shot} />
      ) : cardSrc ? (
        <img
          alt={`Link preview of ${title}`}
          className="aspect-[1200/630] w-full rounded-md border border-line bg-bg object-contain"
          src={cardSrc}
          onError={() => setCardFailed(true)}
        />
      ) : tab === "saved" && !pickedSaved ? null : (
        <img alt="" className="aspect-[1200/630] w-full rounded-md border border-line bg-bg object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} />
      )}
      <p className="text-pretty text-xs text-muted">
        {tab === "saved" && !pickedSaved ? (
          "Save a bath on this device, then share it from here. The link uses your name."
        ) : tab === "live" ? (
          <>
            This picture is the view you are sharing. Name it and sign in. The link opens the same bowls, domes, ears, camera angle, waves, and playback.
            {path ? <> The address is <span className="text-fg">{path}</span>.</> : <> It will live at <span className="text-fg">{predicted}</span>.</>}
          </>
        ) : path ? (
          <>
            Link preview of this setup. <span className="text-fg">{path}</span>
          </>
        ) : (
          <>
            Link preview of this setup. The address will be <span className="text-fg">{predicted}</span>, from your name and the title.
          </>
        )}
      </p>
      <div className="grid grid-cols-3 gap-1" role="tablist">
        {(
          [
            ["live", "This view"],
            ["preset", "Templates"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`h-11 rounded-md border text-sm ${tab === id ? "border-gold text-gold" : "border-line text-muted"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "live" ? (
        <label className="grid gap-1 text-sm text-muted">
          Title
          <input
            className="h-11 rounded-md border border-line bg-surface-2 px-3 text-fg"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      ) : null}
      {needsAccount && (tab !== "saved" || pickedSaved) && !isPending && user && profileName === "" ? (
        <label className="grid gap-1 text-sm text-muted">
          Your name
          <input
            className="h-11 rounded-md border border-line bg-surface-2 px-3 text-fg"
            value={username}
            maxLength={48}
            placeholder="How the link should read"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
      ) : null}
      {needsAccount && (tab !== "saved" || pickedSaved) && !isPending && !user ? (
        <div className="grid gap-2">
          <p className="text-pretty text-xs text-muted">Sign in to save this view as a template under your name. The link is created after you name it.</p>
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              className="h-10 rounded-md border border-line text-sm"
              onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
            >
              Continue with {provider.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      {tab === "saved" && !pickedSaved ? null : (
      <div className="grid grid-cols-2 gap-2">
        {destinations.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={locked}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm disabled:opacity-40"
            onClick={() => void withLink(item.run)}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>
      )}
      {tab === "live" && user && !preset ? (
        <button
          type="button"
          className="h-11 rounded-md bg-gold text-sm font-medium text-bg disabled:opacity-40"
          disabled={busy || profileLoading || !user || (profileName === "" && !username.trim()) || !title.trim()}
          onClick={() => void (path ? publishSnapshot(liveSnapshot()) : ensureLink())}
        >
          {busy ? "Saving the template…" : path ? "Update this link" : "Save template and share"}
        </button>
      ) : null}
      {tab === "saved" && user && pickedSaved ? (
        <button
          type="button"
          className="h-11 rounded-md bg-gold text-sm font-medium text-bg disabled:opacity-40"
          disabled={busy || profileLoading || (profileName === "" && !username.trim())}
          onClick={() => void (pickedSaved.share ? publishSnapshot(savedSnapshot(pickedSaved)) : ensureLink())}
        >
          {busy ? "Saving the link…" : pickedSaved.share ? "Update this link" : "Create share link"}
        </button>
      ) : null}
      {tab === "preset" ? (
        <ul className="max-h-40 overflow-y-auto">
          {PRESETS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`flex h-11 w-full items-center gap-2 border-t border-line px-1 text-left text-sm ${item.id === (pickedPreset?.id ?? "") ? "text-gold" : ""}`}
                onClick={() => setPresetPick(item.id)}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="max-w-36 shrink-0 truncate text-xs text-muted">{`${HOUSE_SLUG}/${item.id}`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tab === "saved" && library.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto">
          {library.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`flex h-11 w-full items-center gap-2 border-t border-line px-1 text-left text-sm ${item.id === (pickedSaved?.id ?? "") ? "text-gold" : ""}`}
                onClick={() => setSavedPick(item.id)}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-muted">{item.share ? sharePath(item.share.userSlug, item.share.slug) : "New link"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
