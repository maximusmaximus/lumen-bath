import { createFileRoute } from "@tanstack/react-router";
import { loadShare } from "@/lib/share/load.server";
import { renderSharePng } from "@/lib/share/png";

export const Route = createFileRoute("/api/share-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const view = await loadShare(url.searchParams.get("user") ?? "", url.searchParams.get("slug") ?? "");
        if (!view) return new Response("Not found", { status: 404 });
        const poster = view.settings.poster;
        if (poster?.startsWith("data:image/jpeg;base64,")) {
          const bytes = Uint8Array.from(atob(poster.slice("data:image/jpeg;base64,".length)), (char) => char.charCodeAt(0));
          return new Response(bytes, {
            headers: {
              "content-type": "image/jpeg",
              "cache-control": "public, max-age=300",
            },
          });
        }
        const png = renderSharePng({
          title: view.title,
          author: view.author,
          room: view.settings.roomShape,
          bowls: view.bowls.map((bowl) => ({ x: bowl.x, y: bowl.y })),
          ears: view.ears.map((ear) => ({ x: ear.x, y: ear.y })),
        });
        return new Response(new Uint8Array(png), {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
