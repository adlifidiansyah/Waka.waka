import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isEmailConfigured } from "@/lib/email/resend";
import type { TokenRow } from "@/components/dashboard/client-link-panel";
import type {
  AuditLog,
  ClientAccessToken,
  Deliverable,
  Invoice,
  Milestone,
  MilestoneWithChildren,
  Project,
} from "@/lib/database.types";

export interface ProjectDetail {
  project: Project;
  milestones: MilestoneWithChildren[];
  tokens: TokenRow[];
  auditLog: AuditLog[];
  /** Whether this deployment can send the portal link by email. */
  emailConfigured: boolean;
  approvedCount: number;
  collectedCents: number;
  outstandingCents: number;
  unpaidInvoiceCount: number;
}

/**
 * Everything the project page renders, assembled outside the component so the
 * render body stays free of clocks and I/O. RLS scopes every query to the
 * caller's organization.
 */
export async function loadProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle<Project>();

  if (!project) return null;

  const { data: milestoneRows } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", project.id)
    .order("order_index", { ascending: true })
    .returns<Milestone[]>();

  const milestones = milestoneRows ?? [];
  const milestoneIds = milestones.map((m) => m.id);

  const [deliverablesResult, invoicesResult, tokensResult, auditResult] = await Promise.all([
    milestoneIds.length
      ? supabase
          .from("deliverables")
          .select("*")
          .in("milestone_id", milestoneIds)
          .order("order_index", { ascending: true })
          .returns<Deliverable[]>()
      : Promise.resolve({ data: [] as Deliverable[] }),
    milestoneIds.length
      ? supabase.from("invoices").select("*").in("milestone_id", milestoneIds).returns<Invoice[]>()
      : Promise.resolve({ data: [] as Invoice[] }),
    supabase
      .from("client_access_tokens")
      .select(
        "id, project_id, label, client_email, expires_at, revoked_at, last_used_at, " +
          "emailed_at, emailed_to, email_provider_id, created_at",
      )
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .returns<Omit<ClientAccessToken, "token_hash">[]>(),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<AuditLog[]>(),
  ]);

  const deliverables = deliverablesResult.data ?? [];
  const invoices = invoicesResult.data ?? [];

  const withChildren: MilestoneWithChildren[] = milestones.map((milestone) => ({
    ...milestone,
    deliverables: deliverables.filter((d) => d.milestone_id === milestone.id),
    invoice: invoices.find((i) => i.milestone_id === milestone.id) ?? null,
  }));

  const now = Date.now();
  const tokens: TokenRow[] = (tokensResult.data ?? []).map((token) => ({
    ...token,
    expired: token.expires_at !== null && new Date(token.expires_at).getTime() < now,
  }));

  const issued = invoices.filter((i) => i.status === "paid" || i.status === "unpaid");

  return {
    project,
    milestones: withChildren,
    tokens,
    auditLog: auditResult.data ?? [],
    emailConfigured: isEmailConfigured(),
    approvedCount: withChildren.filter((m) => m.status === "approved").length,
    collectedCents: issued
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.amount_cents, 0),
    outstandingCents: issued
      .filter((i) => i.status === "unpaid")
      .reduce((sum, i) => sum + i.amount_cents, 0),
    unpaidInvoiceCount: issued.filter((i) => i.status === "unpaid").length,
  };
}
