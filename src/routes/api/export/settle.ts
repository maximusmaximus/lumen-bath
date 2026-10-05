import { createFileRoute } from "@tanstack/react-router";
import { settleExportOrder } from "@/lib/export/export-manager.server";

export const Route = createFileRoute("/api/export/settle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") || "";
          let headerToken = "";
          if (authHeader.startsWith("X402 ") || authHeader.startsWith("Bearer ")) {
            headerToken = authHeader.split(" ")[1]?.trim() || "";
          }

          const url = new URL(request.url);
          const body = (await request.json().catch(() => ({}))) as {
            orderId?: string;
            paymentToken?: string;
            txHash?: string;
          };

          const orderId = body.orderId || url.searchParams.get("orderId") || "";
          const paymentToken = body.paymentToken || headerToken || url.searchParams.get("paymentToken") || "";

          if (!orderId || !paymentToken) {
            return new Response(JSON.stringify({ error: "Missing orderId or paymentToken" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }

          const result = await settleExportOrder(orderId, paymentToken, body.txHash);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Failed to settle order" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
