import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/components/dialogs";
import { FeedbackInbox } from "@/components/feedback";
import { getDashboard, getMyProfile, removeTemplate, saveProfile } from "@/lib/community/api";
import type { DashboardData } from "@/lib/community/types";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const field = "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-fg";

export function DashboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<"profile" | "agent" | "admin">("profile");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpires, setPairingExpires] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const dirty = useRef(false);
  const { user, isPending } = useCurrentUserState();

  async function generatePairing() {
    setPairingLoading(true);
    try {
      const res = await fetch("/api/agent/pair");
      const json = await res.json();
      if (json.code) {
        setPairingCode(json.code);
        setPairingExpires(new Date(json.expiresAt).toLocaleTimeString());
      }
    } catch {
      // noop
    } finally {
      setPairingLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      dirty.current = false;
      return;
    }
    let cancel = false;
    setNote(null);
    const apply = (profile: DashboardData["profile"]) => {
      if (dirty.current) return;
      setUsername(profile?.username ?? "");
      setBio(profile?.bio ?? "");
      setWebsite(profile?.website ?? "");
    };
    getDashboard()
      .then((next) => {
        if (cancel) return;
        setData(next);
        apply(next.profile);
      })
      .catch(async () => {
        const mine = await getMyProfile().catch(() => null);
        if (cancel) return;
        setData({
          profile: mine?.profile ?? null,
          stats: { tracks: 0, plays: 0, shares: 0 },
          templates: [],
          daily: null,
          latest: null,
        });
        apply(mine?.profile ?? null);
        setNote("Stats didn’t load. You can still edit your profile.");
      });
    return () => {
      cancel = true;
    };
  }, [open]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await saveProfile({ data: { username, bio, website } });
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setData((current) => (current ? { ...current, profile: result.profile } : current));
      setUsername(result.profile.username);
      setBio(result.profile.bio);
      setWebsite(result.profile.website);
      setSaved(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(message === "Unauthorized" ? "Sign in to save your profile." : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const result = await removeTemplate({ data: id }).catch(() => null);
    if (!result?.ok) return;
    setData((current) => {
      if (!current) return current;
      const templates = current.templates.filter((item) => item.id !== id);
      const dropped = current.templates.find((item) => item.id === id);
      return {
        ...current,
        templates,
        stats: {
          tracks: templates.length,
          plays: Math.max(0, current.stats.plays - (dropped?.plays ?? 0)),
          shares: Math.max(0, current.stats.shares - (dropped?.shares ?? 0)),
        },
      };
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Dashboard">
      <div className="grid gap-4" data-dashboard>
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Dashboard menu">
          <button
            type="button"
            role="tab"
            aria-selected={menu === "profile"}
            className={`h-11 rounded-md border text-sm ${menu === "profile" ? "border-gold bg-gold text-bg" : "border-line text-fg"}`}
            onClick={() => setMenu("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            data-agent-tab
            aria-selected={menu === "agent"}
            className={`h-11 rounded-md border text-sm ${menu === "agent" ? "border-gold bg-gold text-bg" : "border-line text-fg"}`}
            onClick={() => setMenu("agent")}
          >
            Agent (MCP)
          </button>
          <button
            type="button"
            role="tab"
            data-admin-tab
            aria-selected={menu === "admin"}
            className={`h-11 rounded-md border text-sm ${menu === "admin" ? "border-gold bg-gold text-bg" : "border-line text-fg"}`}
            onClick={() => setMenu("admin")}
          >
            Admin
          </button>
        </div>
        {menu === "admin" ? (
          <FeedbackInbox />
        ) : menu === "agent" ? (
          <div className="grid gap-4">
            <h2 className="font-display text-3xl">Agent & MCP Pairing</h2>
            <p className="text-pretty text-sm text-muted">
              Connect external AI agents (via MCP, Claude, Cursor, Antigravity, Hermes) to compose, save, and load soundscapes under your account without placing elements manually.
            </p>

            {!user ? (
              <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-sm text-muted">
                  Sign in to generate an agent pairing code linked to your user profile.
                </p>
                <Link to="/login" search={{ next: "/dash" }} className="inline-flex h-11 items-center justify-center rounded-md bg-gold text-sm font-medium text-bg">
                  Sign in to Link Agent
                </Link>
                <p className="text-xs text-muted">
                  Note: Headless agents can also use Lumen Bath x402 audio downloads without signing in!
                </p>
              </div>
            ) : (
              <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-sm text-muted">
                  Generate a 6-character pairing code to connect your agent harness:
                </p>

                {pairingCode ? (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between rounded-md border border-gold bg-bg px-4 py-3">
                      <div>
                        <span className="font-mono text-2xl font-bold tracking-widest text-gold">{pairingCode}</span>
                        <p className="text-xs text-muted">Valid until {pairingExpires}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded bg-gold px-3 py-1.5 text-xs font-semibold text-bg"
                        onClick={() => {
                          void navigator.clipboard.writeText(pairingCode);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? "Copied!" : "Copy Code"}
                      </button>
                    </div>
                    <p className="text-xs text-muted">
                      Tell your agent: <code className="text-fg">Pair with code {pairingCode}</code> or call tool <code className="text-fg">lumen_pair_profile</code>.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="h-11 rounded-md bg-gold text-sm font-medium text-bg"
                    disabled={pairingLoading}
                    onClick={() => void generatePairing()}
                  >
                    {pairingLoading ? "Generating…" : "Generate Pairing Code"}
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-2 rounded-lg border border-line p-4">
              <h3 className="font-medium text-fg text-sm">x402 Audio Downloads</h3>
              <p className="text-xs text-muted">
                Agents can export fully rendered song tracks via the x402 payment protocol:
              </p>
              <ul className="grid gap-1 text-xs text-muted">
                <li>• <strong className="text-fg">MP3 (320 kbps)</strong>: $20.00 / hour (CBR high-fidelity, tagged with ID3v2 & cover art)</li>
                <li>• <strong className="text-fg">FLAC (24-bit 48kHz)</strong>: $45.00 / hour (Lossless studio master, includes spatial stems package)</li>
              </ul>
              <p className="text-xs text-muted">
                Account linking allows the agent to produce and organize downloads under your profile; track exports are billed via x402.
              </p>
            </div>
          </div>
        ) : (
        <>
        <p className="text-pretty text-sm text-muted">The bath keeps playing behind this. Escape closes it.</p>
        {!data || isPending ? (
          <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
        ) : (
          <>
            {note && user ? <p className="text-sm text-gold">{note}</p> : null}
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Tracks" value={data.stats.tracks} />
              <Stat label="Plays" value={data.stats.plays} />
              <Stat label="Shares" value={data.stats.shares} />
            </section>
            {!user ? (
              <div className="grid gap-3">
                <h2 className="font-display text-3xl">Profile</h2>
                <p className="text-pretty text-sm text-muted">Sign in to edit your name, bio, and site. The bath keeps playing behind this.</p>
                <Link to="/login" search={{ next: "/dash" }} className="inline-flex h-11 items-center justify-center rounded-md bg-gold text-sm font-medium text-bg">
                  Sign in
                </Link>
              </div>
            ) : (
            <form className="grid gap-3" onSubmit={(event) => void save(event)}>
              <h2 className="font-display text-3xl">Profile</h2>
              <label className="grid gap-1 text-sm text-muted">
                Username
                <input
                  className={field}
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => {
                    dirty.current = true;
                    setUsername(event.target.value);
                  }}
                  maxLength={48}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm text-muted">
                Bio
                <textarea
                  className="min-h-24 rounded-md border border-line bg-surface-2 px-3 py-2 text-fg"
                  name="bio"
                  value={bio}
                  maxLength={400}
                  onChange={(event) => {
                    dirty.current = true;
                    setBio(event.target.value);
                  }}
                />
              </label>
              <label className="grid gap-1 text-sm text-muted">
                Site
                <input
                  className={field}
                  name="website"
                  autoComplete="url"
                  value={website}
                  placeholder="example.com"
                  maxLength={300}
                  onChange={(event) => {
                    dirty.current = true;
                    setWebsite(event.target.value);
                  }}
                />
              </label>
              {formError ? <p className="text-sm text-gold">{formError}</p> : null}
              {saved ? <p className="text-sm text-fg">Saved.</p> : null}
              <button type="submit" className="h-11 rounded-md bg-gold text-sm font-medium text-bg" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </form>
            )}
            <section className="grid gap-2">
              <h2 className="font-display text-3xl">Your baths</h2>
              {data.templates.length === 0 ? (
                <p className="text-pretty text-sm text-muted">Nothing shared yet.</p>
              ) : (
                <ul className="grid gap-2">
                  {data.templates.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                      <Link to="/" search={{ t: item.id }} className="min-w-0 flex-1 py-2" onClick={() => onOpenChange(false)}>
                        <span className="block truncate">{item.title}</span>
                        <span className="text-xs tabular-nums text-muted">
                          {item.plays} plays · {item.shares} shares · {item.bowls} bowls
                        </span>
                      </Link>
                      <button type="button" className="h-11 px-2 text-sm text-muted" onClick={() => void remove(item.id)}>
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-bg px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-4xl tabular-nums leading-none">{value}</p>
    </div>
  );
}
