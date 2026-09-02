import { Terminal } from "lucide-react";

/**
 * Shown instead of a 500 when the app is running without Supabase credentials —
 * the state every fresh clone starts in.
 */
export function SetupRequired({ area }: { area: "portal" | "dashboard" }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-50 px-6 py-12">
      <div className="card w-full max-w-lg p-8">
        <span className="grid size-10 place-items-center rounded-lg bg-ink-900 text-white">
          <Terminal className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">ClientDeck isn&apos;t connected yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {area === "portal"
            ? "This portal can't load because the app has no database credentials."
            : "The dashboard needs a database before it can sign you in."}{" "}
          If this is your deployment, add the Supabase environment variables and restart.
        </p>

        <ol className="mt-5 space-y-3 text-sm text-ink-600">
          <li className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
              1
            </span>
            <span>
              Copy <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">.env.example</code> to{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">.env.local</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
              2
            </span>
            <span>
              Fill in <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
              3
            </span>
            <span>
              Run <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">supabase db reset</code> to
              apply the migrations and demo data
            </span>
          </li>
        </ol>

        <p className="mt-5 text-xs text-ink-400">
          Full instructions are in the project README.
        </p>
      </div>
    </main>
  );
}
