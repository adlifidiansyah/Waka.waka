import type { Metadata } from "next";
import { resolvePortalToken } from "@/lib/portal";
import { isSupabaseConfigured } from "@/lib/env";
import { SetupRequired } from "@/components/setup-required";
import { readableTextOn } from "@/lib/utils";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalOverview } from "@/components/portal/portal-overview";
import { PortalMilestone } from "@/components/portal/portal-milestone";
import { PortalInvalid } from "@/components/portal/portal-invalid";

// Portal pages are per-client and change as work lands; never cache them.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your project",
  robots: { index: false, follow: false },
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isSupabaseConfigured()) return <SetupRequired area="portal" />;

  const lookup = await resolvePortalToken(token);

  if (!lookup.ok) return <PortalInvalid reason={lookup.reason} />;

  const { project, organization, milestones } = lookup.context;
  const approved = milestones.filter((m) => m.status === "approved").length;
  const awaiting = milestones.find((m) => m.status === "in_review");

  return (
    <div
      className="min-h-dvh bg-ink-50"
      style={
        {
          "--portal-brand": organization.brand_color,
          "--portal-brand-contrast": readableTextOn(organization.brand_color),
        } as React.CSSProperties
      }
    >
      <PortalHeader organization={organization} project={project} />

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <PortalOverview
          project={project}
          milestones={milestones}
          approvedCount={approved}
          awaitingTitle={awaiting?.title ?? null}
        />

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
            Project timeline
          </h2>
          {milestones.length === 0 ? (
            <p className="card p-6 text-center text-sm text-ink-500">
              {organization.name} hasn&apos;t added any milestones yet. This page will fill in as
              work starts.
            </p>
          ) : (
            milestones.map((milestone) => (
              <PortalMilestone
                key={milestone.id}
                token={token}
                milestone={milestone}
                currency={project.currency}
                clientName={project.client_name}
              />
            ))
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-3xl px-6 pb-10 text-center text-xs text-ink-400">
        <p>
          This page is private to {project.client_name}. Anyone with the link can see it — don&apos;t
          forward it.
        </p>
        {organization.badge_enabled ? (
          <p className="mt-2">
            Powered by <span className="font-medium text-ink-500">ClientDeck</span>
          </p>
        ) : null}
      </footer>
    </div>
  );
}
