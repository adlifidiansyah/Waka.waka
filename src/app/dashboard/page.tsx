import Link from "next/link";
import { FolderPlus, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PLANS, upgradeReason } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { ProjectCard, type ProjectSummary } from "@/components/dashboard/project-card";
import { UpgradeNotice } from "@/components/dashboard/upgrade-notice";
import type { Milestone, Project } from "@/lib/database.types";

export const metadata = { title: "Projects" };

export default async function DashboardPage() {
  const workspace = await requireWorkspace();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false })
    .returns<Project[]>();

  const projectList = projects ?? [];
  const projectIds = projectList.map((p) => p.id);

  const { data: milestones } = projectIds.length
    ? await supabase
        .from("milestones")
        .select("id, project_id, status")
        .in("project_id", projectIds)
        .returns<Pick<Milestone, "id" | "project_id" | "status">[]>()
    : { data: [] as Pick<Milestone, "id" | "project_id" | "status">[] };

  const summaries: ProjectSummary[] = projectList.map((project) => {
    const own = (milestones ?? []).filter((m) => m.project_id === project.id);
    return {
      project,
      milestoneCount: own.length,
      approvedCount: own.filter((m) => m.status === "approved").length,
      awaitingCount: own.filter((m) => m.status === "in_review").length,
    };
  });

  const activeCount = projectList.filter((p) => p.status === "active").length;
  const notice = upgradeReason(workspace.organization.plan, activeCount);
  const plan = PLANS[workspace.organization.plan];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Projects</h1>
          <p className="mt-1 text-sm text-ink-500">
            {activeCount} active
            {plan.activeProjectLimit === null ? "" : ` of ${plan.activeProjectLimit}`} ·{" "}
            {projectList.length} total
          </p>
        </div>
        {notice ? null : (
          <Link href="/dashboard/projects/new">
            <Button>
              <Plus className="size-4" aria-hidden />
              New project
            </Button>
          </Link>
        )}
      </div>

      {notice ? <UpgradeNotice notice={notice} /> : null}

      {summaries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderPlus className="size-8" aria-hidden />}
            title="No projects yet"
            body="Create your first project, add a couple of milestones, then send your client one link."
            action={
              <Link href="/dashboard/projects/new">
                <Button>Create a project</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <ProjectCard key={summary.project.id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}
