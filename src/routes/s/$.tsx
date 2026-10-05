import { createFileRoute } from "@tanstack/react-router";
import { BathApp } from "@/components/bath-app";
import { getShare } from "@/lib/community/api";
import { parseSharePath, shareCardPath, sharePath } from "@/lib/share/slug";
import type { ShareView } from "@/lib/share/types";

export const Route = createFileRoute("/s/$")({
  loader: async ({ params }) => {
    const parsed = parseSharePath(params._splat ?? "");
    if (!parsed) return { share: null as ShareView | null, origin: "", image: "" };
    const result = await getShare({ data: parsed });
    const share = result.view;
    const origin = result.origin;
    const image = share
      ? `${origin}${shareCardPath(share.userSlug, share.slug)}`
      : "";
    return { share, origin, image };
  },
  head: ({ loaderData }) => {
    const share = loaderData?.share;
    const title = share ? `${share.title} by ${share.author}` : "Lumen Bath";
    const description = share?.description || "A crystal singing-bowl bath.";
    const image = loaderData?.image || "";
    const url = share && loaderData?.origin ? `${loaderData.origin}${sharePath(share.userSlug, share.slug)}` : "";
    const meta: { title?: string; name?: string; property?: string; content?: string }[] = [
      { title },
      { name: "description", content: description },
    ];
    if (share && image) {
      meta.push(
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      );
      if (url) meta.push({ property: "og:url", content: url });
    }
    return { meta };
  },
  component: SharePage,
});

function SharePage() {
  const { share } = Route.useLoaderData();
  return <BathApp share={share} />;
}
