import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, isPlausibleToken } from "@/lib/tokens";
import type {
  Deliverable,
  Invoice,
  Milestone,
  MilestoneWithChildren,
  Organization,
  Project,
} from "@/lib/database.types";

export interface PortalContext {
  tokenId: string;
  clientEmail: string | null;
  project: Project;
  organization: Organization;
  milestones: MilestoneWithChildren[];
}

export type PortalLookup =
  | { ok: true; context: PortalContext }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

/**
 * Resolves a raw magic-link token into everything the portal renders.
 *
 * Reads go through the service role because the client is not a Postgres
 * principal, so every query below is explicitly scoped to the single project
 * the token unlocks. Nothing here accepts a project id from the request.
 */
export async function resolvePortalToken(rawToken: string): Promise<PortalLookup> {
  if (!isPlausibleToken(rawToken)) return { ok: false, reason: "not_found" };

  const supabase = createAdminClient();
  const hash = hashToken(rawToken);

  const { data: token } = await supabase
    .from("client_access_tokens")
    .select("id, project_id, client_email, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!token) return { ok: false, reason: "not_found" };
  if (token.revoked_at) return { ok: false, reason: "revoked" };
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", token.project_id)
    .single<Project>();

  if (!project) return { ok: false, reason: "not_found" };

  const [{ data: organization }, { data: milestoneRows }] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", project.organization_id)
      .single<Organization>(),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("order_index", { ascending: true })
      .returns<Milestone[]>(),
  ]);

  if (!organization) return { ok: false, reason: "not_found" };

  const milestones = milestoneRows ?? [];
  const milestoneIds = milestones.map((m) => m.id);

  const [{ data: deliverables }, { data: invoices }] = await Promise.all([
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
  ]);

  const withChildren: MilestoneWithChildren[] = milestones.map((milestone) => ({
    ...milestone,
    deliverables: (deliverables ?? []).filter((d) => d.milestone_id === milestone.id),
    invoice: (invoices ?? []).find((i) => i.milestone_id === milestone.id) ?? null,
  }));

  // Fire-and-forget: a failed touch must not block the client's page.
  void supabase
    .from("client_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", token.id);

  return {
    ok: true,
    context: {
      tokenId: token.id,
      clientEmail: token.client_email,
      project,
      organization,
      milestones: withChildren,
    },
  };
}

/** The Asset Locker rule, in one place so the UI and the download route agree. */
export function isDeliverableUnlocked(
  deliverable: Pick<Deliverable, "locked_until_paid">,
  invoice: Pick<Invoice, "status"> | null,
) {
  if (!deliverable.locked_until_paid) return true;
  return invoice?.status === "paid";
}

/** Best-effort request attribution for the sign-off trail. */
export async function requestActorMeta() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
  return { ip, userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null };
}
