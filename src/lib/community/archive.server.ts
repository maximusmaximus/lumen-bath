import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { isWorkspacePreview } from "@/lib/env.server";
import { sanitizeBowls, sanitizeReceiver, sanitizeSettings } from "@/lib/community/embed";
import { cleanText } from "@/lib/community/text";
import { sanitizeEars } from "@/lib/share/load.server";
import { slugify } from "@/lib/share/slug";
import {
  LIBRARY_BRANCH,
  aiWeekPath,
  profilePath,
  publishedScenePath,
  savedScenePath,
  savedSlugs,
  sessionPath,
} from "@/lib/community/archive";

if (typeof window !== "undefined") {
  throw new Error("The library archive is server-only.");
}

const REPO = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

type Repo = { owner: string; repo: string };

let tokenCache: Promise<string | null> | null = null;
let branchReady: Promise<boolean> | null = null;
let backlog: Promise<void> | null = null;
let inBacklog = false;

function repoOf(): Repo | null {
  const raw = (process.env.GITHUB_LIBRARY_REPO || process.env.GITHUB_FEEDBACK_REPO || "maximusmaximus/lumen-bath").trim();
  const match = REPO.exec(raw);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function githubToken(): Promise<string | null> {
  const fromEnv = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (fromEnv.length > 20) return Promise.resolve(fromEnv);
  if (!isWorkspacePreview()) return Promise.resolve(null);
  tokenCache ??= new Promise((resolve) => {
    execFile("gh", ["auth", "token"], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        tokenCache = null;
        resolve(null);
        return;
      }
      const token = stdout.trim();
      resolve(token.length > 20 ? token : null);
    });
  });
  return tokenCache;
}

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lumen-bath-library",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function defaultBranch(token: string, repo: Repo): Promise<string> {
  const response = await gh(token, `/repos/${repo.owner}/${repo.repo}`);
  if (!response.ok) return "main";
  const data = (await response.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

async function ensureBranch(token: string, repo: Repo): Promise<boolean> {
  branchReady ??= (async () => {
    const head = await gh(token, `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${LIBRARY_BRANCH}`);
    if (head.ok) return true;
    if (head.status !== 404) return false;
    const baseName = await defaultBranch(token, repo);
    const base = await gh(token, `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(baseName)}`);
    if (!base.ok) return false;
    const ref = (await base.json()) as { object?: { sha?: string } };
    const sha = ref.object?.sha;
    if (!sha) return false;
    const created = await gh(token, `/repos/${repo.owner}/${repo.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${LIBRARY_BRANCH}`, sha }),
    });
    if (!created.ok && created.status !== 422) return false;
    await putText(
      token,
      repo,
      "README.md",
      "Start the library branch",
      "# Library\n\nSaved baths, listener preferences, and weekly AI notes.\nThe app writes these files when someone saves. They are not applied as code.\n",
    );
    return true;
  })().catch(() => false);
  const ok = await branchReady;
  if (!ok) branchReady = null;
  return ok;
}

async function connect(): Promise<{ token: string; repo: Repo } | null> {
  const repo = repoOf();
  if (!repo) return null;
  const token = await githubToken();
  if (!token) return null;
  if (!(await ensureBranch(token, repo))) return null;
  return { token, repo };
}

async function putText(token: string, repo: Repo, path: string, message: string, text: string): Promise<boolean> {
  const read = await gh(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}?ref=${LIBRARY_BRANCH}`);
  let sha: string | undefined;
  if (read.ok) {
    const data = (await read.json()) as { content?: string; sha?: string };
    sha = data.sha;
    if (typeof data.content === "string") {
      const current = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
      if (current === text) return true;
    }
  } else if (read.status !== 404) {
    return false;
  }
  const put = await gh(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: message.slice(0, 120),
      content: Buffer.from(text, "utf8").toString("base64"),
      branch: LIBRARY_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  return put.ok;
}

async function removeFile(token: string, repo: Repo, path: string, message: string): Promise<void> {
  const read = await gh(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}?ref=${LIBRARY_BRANCH}`);
  if (!read.ok) return;
  const data = (await read.json()) as { sha?: string };
  if (!data.sha) return;
  await gh(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}`, {
    method: "DELETE",
    body: JSON.stringify({ message: message.slice(0, 120), sha: data.sha, branch: LIBRARY_BRANCH }),
  });
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function authorKey(userId: string, username: string | null): string {
  const named = username ? slugify(username) : "";
  if (named) return named;
  if (/^[a-z0-9-]{2,42}$/i.test(userId) && !userId.includes("@")) return slugify(userId) || "listener";
  return `member-${createHash("sha256").update(userId).digest("hex").slice(0, 8)}`;
}

export async function archiveScene(input: {
  author: string;
  slug: string;
  title: string;
  description: string;
  settings: unknown;
  receiver: unknown;
  ears: unknown;
  bowls: unknown;
}): Promise<void> {
  if (!inBacklog) await rememberExisting();
  const link = await connect();
  if (!link) return;
  const author = slugify(input.author);
  const slug = slugify(input.slug);
  const bowls = sanitizeBowls(input.bowls);
  if (!author || !slug || !bowls) return;
  const receiver = sanitizeReceiver(input.receiver);
  const body = {
    kind: "user-scene",
    title: cleanText(input.title, 80),
    description: cleanText(input.description, 500),
    author,
    slug,
    savedAt: new Date().toISOString(),
    settings: sanitizeSettings(input.settings),
    receiver,
    ears: sanitizeEars(input.ears, receiver),
    bowls,
  };
  await putText(link.token, link.repo, publishedScenePath(author, slug), `Save scene ${author}/${slug}`, pretty(body));
}

export async function removeArchivedScene(author: string, slug: string): Promise<void> {
  const link = await connect();
  if (!link) return;
  const name = slugify(author);
  const scene = slugify(slug);
  if (!name || !scene) return;
  await removeFile(link.token, link.repo, publishedScenePath(name, scene), `Remove scene ${name}/${scene}`);
}

export async function archiveProfile(profile: { username: string; bio: string; website: string }): Promise<void> {
  if (!inBacklog) await rememberExisting();
  const link = await connect();
  if (!link) return;
  const author = slugify(profile.username);
  if (!author) return;
  const body = {
    kind: "profile",
    author,
    username: cleanText(profile.username, 40),
    bio: cleanText(profile.bio, 400),
    website: cleanText(profile.website, 200),
    savedAt: new Date().toISOString(),
  };
  await putText(link.token, link.repo, profilePath(author), `Save preferences for ${author}`, pretty(body));
}

export async function archiveWeek(week: string, proposal: string, usedVenice: boolean): Promise<void> {
  if (!inBacklog) await rememberExisting();
  const link = await connect();
  if (!link) return;
  const body = {
    kind: "ai-week",
    week,
    usedVenice,
    proposal: cleanText(proposal, 8000),
    savedAt: new Date().toISOString(),
  };
  await putText(link.token, link.repo, aiWeekPath(week), `Save AI notes ${week}`, pretty(body));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function domeList(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    const raw = asRecord(item);
    const id = typeof raw.id === "string" ? raw.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
    if (!id) return [];
    return [
      {
        id,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        size: Number(raw.size) || 0,
        height: Number(raw.height) || 0,
        glass: typeof raw.glass === "string" ? raw.glass.slice(0, 24) : "",
        frequency: Number(raw.frequency) || 0,
        reflect: Number(raw.reflect) || 0,
        diffuse: Number(raw.diffuse) || 0,
        brightness: Number(raw.brightness) || 0,
      },
    ];
  });
}

export async function keepListenerLibrary(userId: string, raw: unknown): Promise<{ archived: boolean }> {
  if (!inBacklog) await rememberExisting();
  const link = await connect();
  if (!link) return { archived: false };
  const sql = await getSql();
  const rows = await sql<{ username: string }>`select username from profiles where user_id = ${userId}`;
  const author = authorKey(userId, rows[0]?.username ?? null);
  const data = asRecord(raw);
  const bowls = sanitizeBowls(data.bowls);
  let archived = false;
  if (bowls) {
    const receiver = sanitizeReceiver(data.receiver);
    const session = {
      kind: "session",
      author,
      activeName: typeof data.activeName === "string" ? cleanText(data.activeName, 80) : "",
      presetId: typeof data.presetId === "string" ? cleanText(data.presetId, 80) : "",
      savedAt: new Date().toISOString(),
      settings: sanitizeSettings(data.settings),
      receiver,
      ears: sanitizeEars(data.ears, receiver),
      domes: domeList(data.domes),
      bowls,
    };
    archived = await putText(link.token, link.repo, sessionPath(author), `Save preferences for ${author}`, pretty(session));
  }
  if (!Array.isArray(data.library)) return { archived };
  const items = data.library.slice(0, 40).flatMap((item) => {
    const row = asRecord(item);
    const name = typeof row.name === "string" ? cleanText(row.name, 48) : "";
    const id = typeof row.id === "string" ? row.id : "";
    const sceneBowls = sanitizeBowls(row.bowls);
    if (!name || !id || !sceneBowls) return [];
    return [{ name, id, row, sceneBowls }];
  });
  const slugs = savedSlugs(items);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const slug = slugs[index];
    if (!item || !slug) continue;
    const receiver = sanitizeReceiver(item.row.receiver);
    const body = {
      kind: "saved-scene",
      title: item.name,
      author,
      slug,
      savedAt: new Date().toISOString(),
      settings: sanitizeSettings(item.row.settings),
      receiver,
      ears: sanitizeEars(item.row.ears, receiver),
      domes: domeList(item.row.domes),
      bowls: item.sceneBowls,
    };
    const wrote = await putText(link.token, link.repo, savedScenePath(author, slug), `Save scene ${author}/${slug}`, pretty(body));
    archived = archived || wrote;
  }
  const folder = `scenes/${author}/saved`;
  const listed = await gh(link.token, `/repos/${link.repo.owner}/${link.repo.repo}/contents/${encodePath(folder)}?ref=${LIBRARY_BRANCH}`);
  if (listed.ok) {
    const files = (await listed.json()) as { name?: string; path?: string }[];
    const keep = new Set(slugs.map((slug) => `${slug}.json`));
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file.name || !file.path || keep.has(file.name) || !file.name.endsWith(".json")) continue;
        await removeFile(link.token, link.repo, file.path, `Remove scene ${author}/${file.name}`);
      }
    }
  }
  return { archived };
}

function rememberExisting(): Promise<void> {
  if (backlog) return backlog;
  backlog = (async () => {
    inBacklog = true;
    try {
      await copyExisting();
    } catch {
      // A later save will try again.
      backlog = null;
    } finally {
      inBacklog = false;
    }
  })();
  return backlog;
}

async function copyExisting(): Promise<void> {
  const link = await connect();
  if (!link) {
    backlog = null;
    return;
  }
  const sql = await getSql();
  const profiles = await sql<{ username: string; bio: string; website: string }>`
    select username, bio, website from profiles
  `.catch(() => []);
  for (const profile of profiles) {
    await archiveProfile(profile).catch(() => undefined);
  }
  const weeks = await sql<{ week: string; proposal: string; used_venice: boolean }>`
    select week, proposal, used_venice from preset_weeks
  `.catch(() => []);
  for (const week of weeks) {
    await archiveWeek(week.week, week.proposal ?? "", Boolean(week.used_venice)).catch(() => undefined);
  }
  const tracks = await sql<{
    id: string;
    title: string;
    description: string;
    settings: unknown;
    receiver: unknown;
    ears: unknown;
    user_slug: string | null;
    slug: string | null;
  }>`
    select id, title, description, settings, receiver, ears, user_slug, slug
    from templates
    where kind = 'track' and user_slug is not null and slug is not null
    order by updated_at desc
    limit 200
  `.catch(() => []);
  for (const track of tracks) {
    if (!track.user_slug || !track.slug) continue;
    const bowls = await sql`
      select frequency, size, height, glass, gain, x, y, sing, muted
      from template_bowls
      where template_id = ${track.id}
      order by bowl_index asc
    `.catch(() => []);
    await archiveScene({
      author: track.user_slug,
      slug: track.slug,
      title: track.title,
      description: track.description,
      settings: track.settings,
      receiver: track.receiver,
      ears: track.ears,
      bowls,
    }).catch(() => undefined);
  }
}
