import { createFileRoute } from "@tanstack/react-router";
import { BathApp } from "@/components/bath-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <BathApp />;
}
