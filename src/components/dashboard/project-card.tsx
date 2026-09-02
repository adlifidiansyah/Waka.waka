import Link from "next/link";
import { BellDot, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { ProjectStatusBadge } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import type { Project } from "@/lib/database.types";

export interface ProjectSummary {
  project: Project;
  milestoneCount: number;
  approvedCount: number;
  awaitingCount: number;
}

export function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const { project, milestoneCount, approvedCount, awaitingCount } = summary;

  return (
    <Link href={`/dashboard/projects/${project.id}`} className="group block">
      <Card className="h-full p-5 transition group-hover:border-ink-300 group-hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold leading-snug text-ink-900">{project.title}</h2>
          <ProjectStatusBadge status={project.status} />
        </div>

        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
          <Users className="size-3.5" aria-hidden />
          {project.client_name}
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-ink-500">
            <span>
              {approvedCount} of {milestoneCount} milestones approved
            </span>
            <span className="font-medium text-ink-700">
              {formatMoney(project.budget_cents, project.currency)}
            </span>
          </div>
          <ProgressBar value={approvedCount} total={milestoneCount} />
        </div>

        {awaitingCount > 0 ? (
          <Badge tone="warning" className="mt-4">
            <BellDot className="size-3" aria-hidden />
            {awaitingCount} awaiting client approval
          </Badge>
        ) : null}
      </Card>
    </Link>
  );
}
