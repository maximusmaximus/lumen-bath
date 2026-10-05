import { createFileRoute } from "@tanstack/react-router";
import { handleCastRelay } from "@/lib/cast/relay.server";

const handle = ({ request }: { request: Request }) => handleCastRelay(request);

export const Route = createFileRoute("/api/cast")({
  server: { handlers: { GET: handle, POST: handle } },
});
