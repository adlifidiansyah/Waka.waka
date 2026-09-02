import Link from "next/link";
import { FolderKanban, Settings } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { SetupRequired } from "@/components/setup-required";
import { PLANS } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupRequired area="dashboard" />;

  const workspace = await requireWorkspace();
  const plan = PLANS[workspace.organization.plan];

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-ink-900">
              <span className="grid size-7 place-items-center rounded-md bg-ink-900 text-sm text-white">
                C
              </span>
              <span className="hidden sm:inline">ClientDeck</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              >
                <FolderKanban className="size-4" aria-hidden />
                Projects
              </Link>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              >
                <Settings className="size-4" aria-hidden />
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-ink-900">
                {workspace.organization.name}
              </p>
              <p className="text-xs text-ink-400">{workspace.email}</p>
            </div>
            <Badge tone={workspace.organization.plan === "free" ? "neutral" : "info"}>
              {plan.name}
            </Badge>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
