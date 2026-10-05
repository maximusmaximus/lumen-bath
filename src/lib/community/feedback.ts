import { cleanText } from "./text.ts";

/** Letters a person can tell apart. No I, O, 0, or 1. */
export const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const BITS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "2": ["11110", "00001", "00001", "01110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

export type FeedbackKind = "bug" | "feature";
export type FeedbackStatus = "local" | "issue" | "draft" | "spam";

export type CaptchaPicture = {
  id: string;
  fills: string[];
  scratch: string;
};

export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  contact: string;
  status: FeedbackStatus;
  summary: string;
  proposal: string;
  issueUrl: string | null;
  prUrl: string | null;
  note: string;
  createdAt: string;
};

export type FiledReport = {
  ok: true;
  id: string;
  status: FeedbackStatus;
  issueUrl: string | null;
  prUrl: string | null;
  summary: string;
};

export type Submission =
  | {
      ok: true;
      kind: FeedbackKind;
      title: string;
      body: string;
      contact: string;
      challengeId: string;
      answer: string;
    }
  | { ok: false; error: string };

export type Verdict = {
  spam: boolean;
  safe: boolean;
  codeUpdate: boolean;
  summary: string;
  proposal: string;
};

const CHALLENGE_ID = /^cap_[a-f0-9]{16}$/;

/** Block a pull request when the note asks for secrets, auth, or a shell. The issue can still be filed. */
const UNSAFE =
  /\b(password|secret|api[_ -]?key|access[_ -]?token|github[_ -]?token|private[_ -]?key|\.env|drop\s+table|rm\s+-rf|child_process|process\.env|workflow|eval\()\b/i;

export function locallyUnsafe(text: string): boolean {
  return UNSAFE.test(text);
}

export function normalizeCaptcha(raw: string): string {
  return raw.normalize("NFC").toUpperCase().replace(/[^A-Z2-9]/g, "");
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bitmapPath(rows: string[], ox: number, oy: number, scale: number, jx: number): string {
  const parts: string[] = [];
  const w = (scale * 0.82).toFixed(2);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== "1") continue;
      const px = (ox + jx + x * scale).toFixed(2);
      const py = (oy + y * scale).toFixed(2);
      parts.push(`M${px} ${py}h${w}v${w}h-${w}z`);
    }
  });
  return parts.join("");
}

/** Block letters for a code. The answer is not written as text. */
export function drawCaptcha(code: string, seed: number): { fills: string[]; scratch: string } {
  const rand = mulberry32(seed || 1);
  const fills: string[] = [];
  for (let i = 0; i < code.length; i += 1) {
    const rows = BITS[code[i] ?? ""];
    if (!rows) continue;
    const jx = (rand() - 0.5) * 2;
    const jy = (rand() - 0.5) * 3;
    fills.push(bitmapPath(rows, 10 + i * 32, 12 + jy, 4.2, jx));
  }
  const y1 = (16 + rand() * 22).toFixed(1);
  const y2 = (16 + rand() * 22).toFixed(1);
  const y3 = (16 + rand() * 22).toFixed(1);
  return { fills, scratch: `M6 ${y1} Q84 ${y2} 162 ${y3}` };
}

export function codeFromAlphabet(length: number, pick: (span: number) => number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += CAPTCHA_CHARS[pick(CAPTCHA_CHARS.length)] ?? "A";
  return out;
}

export function parseVerdict(raw: string): Verdict | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const summary = cleanText(row.summary, 280);
  const proposal = cleanText(row.proposal, 1200);
  if (!summary) return null;
  const spam = row.spam === true;
  const safe = row.safe !== false && !spam;
  const codeUpdate = row.codeUpdate === true && safe && !spam && proposal.length > 20;
  return { spam, safe, codeUpdate, summary, proposal };
}

export function parseSubmission(input: unknown): Submission {
  if (!input || typeof input !== "object") return { ok: false, error: "That note could not be read." };
  const row = input as Record<string, unknown>;
  const kind = row.kind === "feature" ? "feature" : row.kind === "bug" ? "bug" : null;
  if (!kind) return { ok: false, error: "Choose a bug or a feature." };
  const title = cleanText(row.title, 120);
  const body = cleanText(row.body, 4000);
  const contact = cleanText(row.contact, 120);
  if ([...title].length < 3) return { ok: false, error: "Add a short title." };
  if ([...body].length < 8) return { ok: false, error: "Say a little more about it." };
  if (typeof row.challengeId !== "string" || !CHALLENGE_ID.test(row.challengeId)) {
    return { ok: false, error: "The picture expired. Ask for a new one." };
  }
  const answer = normalizeCaptcha(typeof row.answer === "string" ? row.answer : "");
  if (answer.length < 4) return { ok: false, error: "Type the letters in the picture." };
  return { ok: true, kind, title, body, contact, challengeId: row.challengeId, answer };
}

/** Only https links on github.com are safe to show. */
export function publicGithubUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}
