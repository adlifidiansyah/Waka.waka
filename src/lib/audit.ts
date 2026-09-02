import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorType } from "@/lib/database.types";

export interface AuditEntry {
  organizationId: string;
  projectId?: string | null;
  milestoneId?: string | null;
  action: string;
  actorType: ActorType;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends to the sign-off trail. Audit writes never fail a user action -- a
 * missing log line is worth less than a blocked approval -- but they are
 * surfaced on the server console so the gap is visible.
 */
export async function recordAudit(supabase: SupabaseClient, entry: AuditEntry) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: entry.organizationId,
    project_id: entry.projectId ?? null,
    milestone_id: entry.milestoneId ?? null,
    action: entry.action,
    actor_type: entry.actorType,
    actor_email: entry.actorEmail ?? null,
    ip_address: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.error("[audit] failed to record entry", { action: entry.action, error: error.message });
  }
}
