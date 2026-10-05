import { createFileRoute } from "@tanstack/react-router";
import { claimPairingCode, createPairingSession } from "@/lib/agent/pairing.server";
import { getSessionUser } from "@/lib/auth/verify.server";

export const Route = createFileRoute("/api/agent/pair")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getSessionUser();
        if (!user) {
          return new Response(JSON.stringify({ error: "Sign in to generate an agent pairing code." }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const session = await createPairingSession(user.id);
        return new Response(JSON.stringify(session), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { pairingCode?: string; code?: string };
          const code = body.pairingCode || body.code || "";
          const result = await claimPairingCode(code);
          if (!result.ok) {
            return new Response(JSON.stringify({ error: result.error }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
