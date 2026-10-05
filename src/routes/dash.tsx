import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dash")({
  component: () => <Navigate to="/" search={{ dash: 1 }} />,
});
