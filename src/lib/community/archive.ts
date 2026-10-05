import { slugify } from "../share/slug.ts";

/** Files land on this branch so a save does not redeploy the site. */
export const LIBRARY_BRANCH = "library";

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** A path segment that is safe to put in a GitHub contents URL. */
export function safeSegment(raw: string, fallback: string): string {
  const slug = slugify(raw);
  if (SEGMENT.test(slug)) return slug;
  return SEGMENT.test(fallback) ? fallback : "bath";
}

export function publishedScenePath(author: string, slug: string): string {
  return `scenes/${safeSegment(author, "listener")}/${safeSegment(slug, "bath")}.json`;
}

export function savedScenePath(author: string, slug: string): string {
  return `scenes/${safeSegment(author, "listener")}/saved/${safeSegment(slug, "bath")}.json`;
}

export function profilePath(author: string): string {
  return `preferences/${safeSegment(author, "listener")}/profile.json`;
}

export function sessionPath(author: string): string {
  return `preferences/${safeSegment(author, "listener")}/session.json`;
}

export function aiWeekPath(week: string): string {
  return `ai/weeks/${safeSegment(week.toLowerCase(), "week")}.json`;
}

/** Distinct slugs for a listener's privately saved baths. */
export function savedSlugs(items: { name: string; id: string }[]): string[] {
  const used = new Set<string>();
  return items.map((item) => {
    const base = safeSegment(item.name, "bath");
    let slug = base;
    if (used.has(slug)) {
      const tail = item.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase() || "2";
      slug = safeSegment(`${base}-${tail}`, `${base}-2`);
    }
    used.add(slug);
    return slug;
  });
}
