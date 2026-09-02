import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, MilestoneStatus, ProjectStatus } from "@/lib/database.types";

const MILESTONE_LABELS: Record<MilestoneStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" }> = {
  pending: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  in_review: { label: "Awaiting your approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
};

const INVOICE_LABELS: Record<InvoiceStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  draft: { label: "Not invoiced", tone: "neutral" },
  unpaid: { label: "Payment due", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "danger" },
};

const PROJECT_LABELS: Record<ProjectStatus, { label: string; tone: "success" | "warning" | "info" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "info" },
  archived: { label: "Archived", tone: "neutral" },
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  const { label, tone } = MILESTONE_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, tone } = INVOICE_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, tone } = PROJECT_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function milestoneStatusLabel(status: MilestoneStatus) {
  return MILESTONE_LABELS[status].label;
}
