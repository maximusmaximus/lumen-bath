import { execFile } from "node:child_process";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql, type Sql } from "@/lib/db";
import { isWorkspacePreview } from "@/lib/env.server";
import { cleanText } from "@/lib/community/text";
import {
  codeFromAlphabet,
  drawCaptcha,
  locallyUnsafe,
  parseVerdict,
  publicGithubUrl,
  type CaptchaPicture,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackStatus,
  type FiledReport,
  type Submission,
  type Verdict,
} from "@/lib/community/feedback";

if (typeof window !== "undefined") {
  throw new Error("Feedback filing is server-only.");
}

type ReportRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  contact: string;
  status: string;
  summary: string;
  proposal: string;
  issue_url: string | null;
  pr_url: string | null;
  note: string;
  created_at: string | Date;
};

let tokenCache: Promise<string | null> | null = null;

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

function feedbackRepo(): { owner: string; repo: string } | null {
  const raw = (process.env.GITHUB_FEEDBACK_REPO || "maximusmaximus/lumen-bath").trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(raw);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function safeGitHubMessage(text: string): string {
  return cleanText(text, 160)
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "")
    .replace(/Bearer\s+\S+/gi, "");
}

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lumen-bath-feedback",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(12000),
  });
}

function clientHash(): string {
  const request = getRequest();
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ip = forwarded || request?.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`lumen-feedback:${ip}`).digest("hex").slice(0, 32);
}

function sameAnswer(expected: string, given: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function asStatus(value: string): FeedbackStatus {
  if (value === "issue" || value === "draft" || value === "spam") return value;
  return "local";
}

function asKind(value: string): FeedbackKind {
  return value === "feature" ? "feature" : "bug";
}

function mapRow(row: ReportRow): FeedbackItem {
  return {
    id: row.id,
    kind: asKind(row.kind),
    title: row.title,
    body: row.body,
    contact: row.contact,
    status: asStatus(row.status),
    summary: row.summary,
    proposal: row.proposal,
    issueUrl: publicGithubUrl(row.issue_url),
    prUrl: publicGithubUrl(row.pr_url),
    note: row.note,
    createdAt: iso(row.created_at),
  };
}

export async function issueChallenge(sql?: Sql): Promise<CaptchaPicture> {
  const db = sql ?? (await getSql());
  const code = codeFromAlphabet(5, (span) => randomInt(span));
  const seed = randomInt(1, 2_147_483_646);
  const picture = drawCaptcha(code, seed);
  const id = `cap_${randomBytes(8).toString("hex")}`;
  await db`delete from feedback_challenges where expires_at < now()`;
  await db`
    insert into feedback_challenges (id, answer, expires_at)
    values (${id}, ${code}, now() + interval '10 minutes')
  `;
  return { id, fills: picture.fills, scratch: picture.scratch };
}

async function tooSoon(sql: Sql, hash: string): Promise<boolean> {
  const burst = await sql<{ n: number | string }>`
    select count(*) as n from feedback_reports
    where ip_hash = ${hash} and created_at > now() - interval '30 seconds'
  `;
  if (Number(burst[0]?.n ?? 0) >= 1) return true;
  const recent = await sql<{ n: number | string }>`
    select count(*) as n from feedback_reports
    where ip_hash = ${hash} and created_at > now() - interval '10 minutes'
  `;
  return Number(recent[0]?.n ?? 0) >= 5;
}

async function checkCaptcha(sql: Sql, id: string, answer: string): Promise<"ok" | "again" | "refresh"> {
  const rows = await sql<{ answer: string; attempts: number | string }>`
    update feedback_challenges
    set attempts = attempts + 1
    where id = ${id} and expires_at > now()
    returning answer, attempts
  `;
  const row = rows[0];
  if (!row) return "refresh";
  const attempts = Number(row.attempts);
  if (!sameAnswer(row.answer, answer)) {
    if (attempts >= 5) {
      await sql`delete from feedback_challenges where id = ${id}`;
      return "refresh";
    }
    return "again";
  }
  await sql`delete from feedback_challenges where id = ${id}`;
  return "ok";
}

function allowList(): string[] {
  return (process.env.FEEDBACK_ADMINS ?? "maximusmaximus")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function canAdmin(sql: Sql, userId: string | null): Promise<boolean> {
  if (isWorkspacePreview()) return true;
  if (!userId) return false;
  if (userId === "dev-user") return true;
  let email = "";
  try {
    const rows = await sql<{ email: string }>`select "email" from "user" where "id" = ${userId} limit 1`;
    email = (rows[0]?.email ?? "").toLowerCase();
  } catch {
    email = "";
  }
  const allow = allowList();
  const local = email.split("@")[0] ?? "";
  return allow.includes(email) || (local.length > 1 && allow.includes(local)) || allow.includes(userId.toLowerCase());
}

type IssueResult = { url: string; number: number } | { error: string };

async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<IssueResult> {
  const response = await gh(token, `/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  const text = await response.text();
  if (!response.ok) return { error: safeGitHubMessage(text) || "GitHub did not accept the issue." };
  let data: { html_url?: string; number?: number };
  try {
    data = JSON.parse(text) as { html_url?: string; number?: number };
  } catch {
    return { error: "GitHub did not return an issue link." };
  }
  const url = publicGithubUrl(data.html_url);
  if (!url || !data.number) return { error: "GitHub did not return an issue link." };
  return { url, number: data.number };
}

async function defaultBranch(token: string, owner: string, repo: string): Promise<string> {
  const response = await gh(token, `/repos/${owner}/${repo}`);
  if (!response.ok) return "main";
  const data = (await response.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

function proposalMarkdown(input: {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  verdict: Verdict;
}): string {
  return [
    "# Suggested update",
    "",
    "This is a draft proposal. Merging this file does not change the bath.",
    "Read it, then make the edit by hand, or close the pull request.",
    "",
    `Kind: ${input.kind}`,
    `Ref: ${input.id}`,
    "",
    `## ${input.title}`,
    "",
    input.body,
    "",
    "## Venice",
    "",
    input.verdict.summary,
    "",
    input.verdict.proposal,
    "",
    "Nothing here is applied automatically.",
  ].join("\n");
}

async function openDraft(input: {
  token: string;
  owner: string;
  repo: string;
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  verdict: Verdict;
  issueNumber: number;
}): Promise<{ url: string; number: number } | { error: string }> {
  const base = await defaultBranch(input.token, input.owner, input.repo);
  const refResponse = await gh(input.token, `/repos/${input.owner}/${input.repo}/git/ref/heads/${base}`);
  if (!refResponse.ok) return { error: "Could not read the default branch." };
  const ref = (await refResponse.json()) as { object?: { sha?: string } };
  const sha = ref.object?.sha;
  if (!sha) return { error: "Could not read the default branch." };
  const branch = `feedback/${input.id}`;
  const created = await gh(input.token, `/repos/${input.owner}/${input.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!created.ok && created.status !== 422) return { error: "Could not open a branch for the proposal." };
  const file = proposalMarkdown(input);
  const put = await gh(input.token, `/repos/${input.owner}/${input.repo}/contents/feedback/proposals/${input.id}.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Propose update from feedback ${input.id}`,
      content: Buffer.from(file, "utf8").toString("base64"),
      branch,
    }),
  });
  if (!put.ok) return { error: "Could not write the proposal." };
  const title = `Feedback: ${input.verdict.summary}`.slice(0, 120);
  const pullBody = [
    input.verdict.summary,
    "",
    "Draft only. This pull request adds a written proposal. It does not change the app, and it does not merge on its own.",
    "",
    `Issue: #${input.issueNumber}`,
  ].join("\n");
  const pull = await gh(input.token, `/repos/${input.owner}/${input.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title,
      head: branch,
      base,
      draft: true,
      body: pullBody,
    }),
  });
  const pullText = await pull.text();
  if (!pull.ok) return { error: safeGitHubMessage(pullText) || "Could not open the draft pull request." };
  let data: { html_url?: string; number?: number };
  try {
    data = JSON.parse(pullText) as { html_url?: string; number?: number };
  } catch {
    return { error: "GitHub did not return a pull request link." };
  }
  const url = publicGithubUrl(data.html_url);
  if (!url || !data.number) return { error: "GitHub did not return a pull request link." };
  await gh(input.token, `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `Draft pull request: ${url}\n\nThis is a written proposal, not an applied patch. Nothing merges until a person reviews it.`,
    }),
  }).catch(() => undefined);
  return { url, number: data.number };
}

function issueTitle(kind: FeedbackKind, title: string): string {
  const prefix = kind === "bug" ? "[bug] " : "[feature] ";
  return `${prefix}${title}`.slice(0, 120);
}

function issueBody(input: {
  id: string;
  kind: FeedbackKind;
  body: string;
  verdict: Verdict | null;
  reviewNote: string;
}): string {
  const review = input.verdict
    ? input.verdict.spam
      ? `Venice flagged this as spam. No pull request was opened.\n\n${input.verdict.summary}`
      : input.verdict.codeUpdate
        ? `Venice accepted this as a possible code update. A draft pull request may follow. It is not merged automatically.\n\n${input.verdict.summary}`
        : `Venice kept this as an issue, not a code change.\n\n${input.verdict.summary}`
    : input.reviewNote;
  return [`Kind: ${input.kind}`, `Ref: ${input.id}`, "", input.body, "", "---", review, "", "Sent from the Lumen Bath feedback buttons."].join(
    "\n",
  );
}

export async function fileFeedback(submission: Submission, reporterId: string | null): Promise<FiledReport | { ok: false; error: string; challenge?: CaptchaPicture }> {
  if (!submission.ok) return submission;
  const sql = await getSql();
  const hash = clientHash();
  if (await tooSoon(sql, hash)) {
    return { ok: false, error: "Wait a moment before sending another note." };
  }
  const captcha = await checkCaptcha(sql, submission.challengeId, submission.answer);
  if (captcha === "again") return { ok: false, error: "Those letters did not match." };
  if (captcha === "refresh") {
    return { ok: false, error: "That picture expired. Here is a new one.", challenge: await issueChallenge(sql) };
  }

  const id = `fb_${randomBytes(8).toString("hex")}`;
  const { reviewFeedbackNote } = await import("@/lib/community/venice.server");
  const answer = await reviewFeedbackNote(
    `Kind: ${submission.kind}\nTitle: ${submission.title}\nNote:\n${submission.body}`,
  );
  let verdict = answer.ok ? parseVerdict(answer.text) : null;
  let reviewNote = "Venice did not review this note. It is saved for another look.";
  if (!answer.ok && answer.reason === "balance") {
    reviewNote = "Venice has no balance left, so this stayed a note.";
  }
  if (verdict && locallyUnsafe(`${submission.title}\n${submission.body}\n${verdict.proposal}`)) {
    verdict = { ...verdict, safe: false, codeUpdate: false, summary: verdict.summary || "Held back from a code change." };
  }

  const status: FeedbackStatus = verdict?.spam ? "spam" : "local";
  await sql`
    insert into feedback_reports (
      id, kind, title, body, contact, status, summary, proposal, note, reporter_id, ip_hash
    ) values (
      ${id},
      ${submission.kind},
      ${submission.title},
      ${submission.body},
      ${submission.contact},
      ${status},
      ${verdict?.summary ?? ""},
      ${verdict?.proposal ?? ""},
      ${verdict ? "" : reviewNote},
      ${reporterId},
      ${hash}
    )
  `;

  const repo = feedbackRepo();
  const token = repo ? await githubToken() : null;
  if (!repo || !token) {
    const note = "Saved in Admin. The repository is not connected from this server yet.";
    await sql`update feedback_reports set note = ${note} where id = ${id}`;
    return {
      ok: true,
      id,
      status,
      issueUrl: null,
      prUrl: null,
      summary: verdict?.summary || note,
    };
  }

  let issue: IssueResult;
  try {
    issue = await createIssue(
      token,
      repo.owner,
      repo.repo,
      issueTitle(submission.kind, submission.title),
      issueBody({ id, kind: submission.kind, body: submission.body, verdict, reviewNote }),
    );
  } catch {
    issue = { error: "GitHub did not answer." };
  }

  if ("error" in issue) {
    await sql`update feedback_reports set note = ${issue.error} where id = ${id}`;
    return { ok: true, id, status, issueUrl: null, prUrl: null, summary: verdict?.summary || issue.error };
  }

  let nextStatus: FeedbackStatus = verdict?.spam ? "spam" : "issue";
  let prUrl: string | null = null;
  let prNumber: number | null = null;
  let note = "";
  const wantsPr = Boolean(verdict?.codeUpdate && verdict.safe && !verdict.spam);
  if (wantsPr && verdict) {
    try {
      const pull = await openDraft({
        token,
        owner: repo.owner,
        repo: repo.repo,
        id,
        kind: submission.kind,
        title: submission.title,
        body: submission.body,
        verdict,
        issueNumber: issue.number,
      });
      if ("error" in pull) note = pull.error;
      else {
        nextStatus = "draft";
        prUrl = pull.url;
        prNumber = pull.number;
      }
    } catch {
      note = "The issue was filed. The draft pull request was not opened.";
    }
  }

  await sql`
    update feedback_reports
    set status = ${nextStatus},
        issue_url = ${issue.url},
        issue_number = ${issue.number},
        pr_url = ${prUrl},
        pr_number = ${prNumber},
        note = ${note}
    where id = ${id}
  `;
  return {
    ok: true,
    id,
    status: nextStatus,
    issueUrl: issue.url,
    prUrl,
    summary: verdict?.summary ?? "",
  };
}

export async function listInbox(userId: string | null): Promise<{ admin: boolean; items: FeedbackItem[] }> {
  const sql = await getSql();
  if (!(await canAdmin(sql, userId))) return { admin: false, items: [] };
  const rows = await sql<ReportRow>`
    select id, kind, title, body, contact, status, summary, proposal, issue_url, pr_url, note, created_at
    from feedback_reports
    order by created_at desc
    limit 40
  `;
  return { admin: true, items: rows.map(mapRow) };
}
