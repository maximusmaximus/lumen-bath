import { createFileRoute } from "@tanstack/react-router";
import { getRenderedArtifact } from "@/lib/export/export-manager.server";

export const Route = createFileRoute("/api/export/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId") || url.searchParams.get("id") || "";
        if (!orderId) {
          return new Response("Missing orderId parameter", { status: 400 });
        }

        const artifact = getRenderedArtifact(orderId);
        if (!artifact) {
          return new Response("Audio file not found or still preparing. Check /api/export/status.", {
            status: 404,
          });
        }

        return new Response(new Uint8Array(artifact.buffer), {
          status: 200,
          headers: {
            "content-type": artifact.mimeType,
            "content-disposition": `attachment; filename="${artifact.filename}"`,
            "content-length": artifact.buffer.length.toString(),
            "cache-control": "private, no-cache",
          },
        });
      },
    },
  },
});
