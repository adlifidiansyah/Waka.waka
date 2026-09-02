import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "@/components/dashboard/branding-form";
import { PlanPicker } from "@/components/dashboard/plan-picker";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const workspace = await requireWorkspace();
  const supabase = await createClient();

  const { count: activeProjects } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", workspace.organization.id)
    .eq("status", "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          How your studio shows up in every client portal.
        </p>
      </div>

      <BrandingForm organization={workspace.organization} />

      <div id="plan">
        <PlanPicker
          organization={workspace.organization}
          activeProjects={activeProjects ?? 0}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Identifiers you may need for support or webhooks.</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-400">Organization ID</dt>
              <dd className="mt-0.5 font-mono text-xs text-ink-700">{workspace.organization.id}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Slug</dt>
              <dd className="mt-0.5 text-ink-700">{workspace.organization.slug}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Your role</dt>
              <dd className="mt-0.5 capitalize text-ink-700">{workspace.role}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Created</dt>
              <dd className="mt-0.5 text-ink-700">{formatDate(workspace.organization.created_at)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
