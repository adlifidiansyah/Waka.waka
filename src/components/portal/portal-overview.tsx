import { CircleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { formatMoney } from "@/lib/utils";
import type { MilestoneWithChildren, Project } from "@/lib/database.types";

export function PortalOverview({
  project,
  milestones,
  approvedCount,
  awaitingTitle,
}: {
  project: Project;
  milestones: MilestoneWithChildren[];
  approvedCount: number;
  awaitingTitle: string | null;
}) {
  const outstanding = milestones
    .filter((m) => m.invoice?.status === "unpaid")
    .reduce((sum, m) => sum + (m.invoice?.amount_cents ?? 0), 0);

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">{project.title}</h1>
      {project.description ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{project.description}</p>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium text-ink-700">
            {approvedCount} of {milestones.length} steps approved
          </span>
          <span className="text-ink-400">
            {milestones.length > 0
              ? `${Math.round((approvedCount / milestones.length) * 100)}%`
              : "—"}
          </span>
        </div>
        <ProgressBar brand value={approvedCount} total={milestones.length} />
      </div>

      {awaitingTitle ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">&ldquo;{awaitingTitle}&rdquo;</span> is waiting on your
            approval. Review it below and hit approve when you&apos;re happy.
          </span>
        </p>
      ) : null}

      {outstanding > 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          Outstanding balance:{" "}
          <span className="font-medium text-ink-900">
            {formatMoney(outstanding, project.currency)}
          </span>
        </p>
      ) : null}
    </Card>
  );
}
