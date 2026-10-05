import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next: string } => {
    const next = typeof search.next === "string" ? search.next : "/";
    if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return { next: "/" };
    return { next };
  },
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <div className="h-12 w-40 animate-pulse rounded-md bg-surface-2" />
      </main>
    );
  }
  if (user) return <Navigate to={next === "/dash" ? "/dash" : "/"} />;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <p className="text-sm text-muted">Lumen Bath</p>
        <h1 className="mt-1 font-display text-5xl text-fg">Sign in</h1>
        <p className="mt-3 text-pretty text-sm text-muted">
          Google keeps this browser signed in. If you leave and come back, it’s the same username — titles, bios, and comments can use emoji.
        </p>
        <div className="mt-6 grid gap-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => signIn(provider.providerId, { callbackURL: next })}
                className={`h-12 rounded-md text-sm font-medium ${
                  provider.idp === "google" ? "bg-gold text-bg" : "border border-line text-fg"
                }`}
              >
                Continue with {provider.label}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is unavailable.</p>
          )}
        </div>
        <Link to="/" className="mt-6 inline-flex h-11 items-center text-sm text-gold">
          Back to the bath
        </Link>
      </div>
    </main>
  );
}
