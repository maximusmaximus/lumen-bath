/** Built-in templates share under this name. */
export const HOUSE_SLUG = "lumen";

/** Lowercase slug. Emoji and punctuation fold into hyphens. Empty if nothing remains. */
export function slugify(raw: string): string {
  const ascii = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

export function sharePath(user: string, slug: string): string {
  return `/s/${user}/${slug}.html`;
}

/** Snapshot the share page uses as its Open Graph image, and as the Fan Created icon. */
export function shareCardPath(user: string, slug: string): string {
  return `/api/share-card?user=${encodeURIComponent(user)}&slug=${encodeURIComponent(slug)}`;
}

/** `maxi/chapel-dawn` or `maxi/chapel-dawn.html`. */
export function parseSharePath(raw: string): { user: string; slug: string } | null {
  const clean = decodeURIComponent(raw).replace(/\.html$/i, "").replace(/^\/+|\/+$/g, "");
  const [userRaw, slugRaw] = clean.split("/").filter(Boolean);
  if (!userRaw || !slugRaw) return null;
  const user = slugify(userRaw);
  const slug = slugify(slugRaw);
  if (!user || !slug) return null;
  return { user, slug };
}
