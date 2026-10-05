import { createFileRoute } from "@tanstack/react-router";
import { getOrderStatus } from "@/lib/export/export-manager.server";

export const Route = createFileRoute("/api/export/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const orderId = url.searchParams.get("orderId") || url.searchParams.get("id") || "";
          if (!orderId) {
            return new Response(JSON.stringify({ error: "Missing orderId parameter" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }

          const status = await getOrderStatus(orderId);
          return new Response(JSON.stringify(status), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Failed to get order status" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
