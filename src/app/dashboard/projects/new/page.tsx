import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { upgradeReason } from "@/lib/plans";
import { NewProjectForm } from "@/components/dashboard/new-project-form";
import { UpgradeNotice } from "@/components/dashboard/upgrade-notice";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const workspace = await requireWorkspace();
  const supabase = await createClient();

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", workspace.organization.id)
    .eq("status", "active");

  const notice = upgradeReason(workspace.organization.plan, count ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">New project</h1>
        <p className="mt-1 text-sm text-ink-500">
          Milestones and the client link come next, once the project exists.
        </p>
      </div>

      {notice ? <UpgradeNotice notice={notice} /> : <NewProjectForm />}
    </div>
  );
}
