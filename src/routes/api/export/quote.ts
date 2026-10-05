import { createFileRoute } from "@tanstack/react-router";
import { calculateQuote, type CartQuoteRequest } from "@/lib/export/export-manager.server";

export const Route = createFileRoute("/api/export/quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as CartQuoteRequest;
          const quote = calculateQuote(body);
          return new Response(JSON.stringify(quote), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Failed to calculate quote" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
