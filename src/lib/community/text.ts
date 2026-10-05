/** NFC text that keeps emoji and strips only control characters. */

export function cleanText(raw: unknown, maxPoints: number): string {
  if (typeof raw !== "string") return "";
  const stripped = raw.replace(/[\u0000-\u001F\u007F]/g, "").normalize("NFC").trim();
  return [...stripped].slice(0, maxPoints).join("");
}

export function cleanUsername(raw: unknown): { value: string } | { error: string } {
  const value = cleanText(raw, 48);
  const points = [...value];
  if (points.length < 2) return { error: "Username needs at least 2 characters." };
  const hasMark = points.some((ch) => /\p{L}|\p{N}|\p{Extended_Pictographic}/u.test(ch));
  if (!hasMark) return { error: "Use letters, numbers, or emoji in the username." };
  return { value };
}

export function cleanWebsite(raw: unknown): { value: string } | { error: string } {
  let text = cleanText(raw, 300);
  if (!text || text === "https://" || text === "http://") return { value: "" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That link could not be read. Try a domain like example.com." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "Link must be a web address." };
  }
  return { value: url.toString().slice(0, 300) };
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** ISO week, UTC, such as 2026-W40. Thursday decides the year. */
export function isoWeek(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

const ID_RE = /^[a-zA-Z0-9-]{8,80}$/;

export function cleanId(raw: unknown): string | null {
  if (typeof raw !== "string" || !ID_RE.test(raw)) return null;
  return raw;
}
