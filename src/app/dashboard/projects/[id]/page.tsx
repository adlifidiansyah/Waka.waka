import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { loadProjectDetail } from "@/lib/projects";
import { formatMoney } from "@/lib/utils";
import { ProjectStatusBadge } from "@/components/ui/status";
import { ProgressBar } from "@/components/ui/progress";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClientLinkPanel } from "@/components/dashboard/client-link-panel";
import { MilestoneEditor } from "@/components/dashboard/milestone-editor";
import { AddMilestoneForm } from "@/components/dashboard/add-milestone-form";
import { AuditTrail } from "@/components/dashboard/audit-trail";
import { ProjectStatusControl } from "@/components/dashboard/project-status-control";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireWorkspace();

  const detail = await loadProjectDetail(id);
  if (!detail) notFound();

  const {
    project,
    milestones,
    tokens,
    auditLog,
    emailConfigured,
    approvedCount,
    collectedCents,
    outstandingCents,
    unpaidInvoiceCount,
  } = detail;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Projects
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{project.title}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            <span>{project.client_name}</span>
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3.5" aria-hidden />
              {project.client_email}
            </span>
          </p>
          {project.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
              {project.description}
            </p>
          ) : null}
        </div>
        <ProjectStatusControl projectId={project.id} status={project.status} />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">Progress</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {approvedCount}
            <span className="text-base font-normal text-ink-400">/{milestones.length}</span>
          </p>
          <ProgressBar className="mt-3" value={approvedCount} total={milestones.length} />
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">Collected</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {formatMoney(collectedCents, project.currency)}
          </p>
          <p className="mt-3 text-xs text-ink-400">
            of {formatMoney(project.budget_cents, project.currency)} budget
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {formatMoney(outstandingCents, project.currency)}
          </p>
          <p className="mt-3 text-xs text-ink-400">
            {unpaidInvoiceCount} invoice{unpaidInvoiceCount === 1 ? "" : "s"} awaiting payment
          </p>
        </Card>
      </div>

      <ClientLinkPanel
        projectId={project.id}
        tokens={tokens}
        emailConfigured={emailConfigured}
        clientEmail={project.client_email}
      />

      {/* Milestones */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              What your client sees, in order. Send one for review to put it in front of them.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {milestones.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-500">
              No milestones yet. Add the first one below.
            </p>
          ) : (
            milestones.map((milestone) => (
              <MilestoneEditor
                key={milestone.id}
                projectId={project.id}
                currency={project.currency}
                milestone={milestone}
              />
            ))
          )}
          <AddMilestoneForm projectId={project.id} currency={project.currency} />
        </CardBody>
      </Card>

      <AuditTrail entries={auditLog} />
    </div>
  );
}
