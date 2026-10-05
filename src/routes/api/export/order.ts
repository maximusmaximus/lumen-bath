import { createFileRoute } from "@tanstack/react-router";
import { createExportOrder, type CartQuoteRequest } from "@/lib/export/export-manager.server";
import { resolveUserFromAgentToken } from "@/lib/agent/pairing.server";
import { getSessionUser } from "@/lib/auth/verify.server";

export const Route = createFileRoute("/api/export/order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") || "";
          let userId: string | null = null;

          if (authHeader.startsWith("Bearer lmn_agt_")) {
            const token = authHeader.slice("Bearer ".length).trim();
            const resolved = await resolveUserFromAgentToken(token);
            if (resolved) userId = resolved.userId;
          } else {
            const sessionUser = await getSessionUser().catch(() => null);
            if (sessionUser) userId = sessionUser.id;
          }

          const body = (await request.json()) as CartQuoteRequest;
          const order = await createExportOrder(body, userId);

          // HTTP 402 Payment Required response for x402 protocol compliance
          return new Response(JSON.stringify(order), {
            status: 402,
            headers: {
              "content-type": "application/json",
              "WWW-Authenticate": `x402 token="${order.x402.paymentToken}", amount="${order.x402.amountUsd}", currency="USD"`,
              "X-Payment-Required": "true",
              "X-Price-USD": order.x402.amountUsd,
            },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Failed to create order" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
