import { recordPlay } from "@/lib/community/api";

const PREFIX = "lumen-played-";

/** Count a listen once per browser session, including after a refresh. */
export function notePlay(id: string | null | undefined) {
  if (!id) return;
  try {
    const key = `${PREFIX}${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  void recordPlay({ data: id }).catch(() => undefined);
}
